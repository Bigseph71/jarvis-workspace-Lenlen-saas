import { randomBytes } from "node:crypto";
import { AuditAction, UserRole, withTenant, type Locale } from "@len-len/database";
import { AppError, ConflictError, ForbiddenError } from "../../lib/errors.js";
import { hashPassword } from "../../lib/password.js";
import { revokeAccessTokensBefore } from "../../lib/token-revocation.js";
import { writeAudit } from "../../lib/audit.js";
import type { TenantContext } from "../../lib/context.js";
import type { CreateFachkraftUserInput } from "./user.schemas.js";
import { issueInvitation } from "./invitation.service.js";

interface AccountUser {
  id: string;
  email: string;
  role: UserRole;
  organizationId: string;
  language: Locale;
}

export interface FachkraftAccount {
  user: AccountUser;
  caregiverId: string;
  /**
   * Einladungslink: nur in dieser Antwort, danach nirgends mehr abrufbar. Der
   * Admin gibt ihn weiter, die Fachkraft wählt darüber ihr Passwort.
   */
  invitationUrl: string;
  invitationExpiresAt: Date;
}

/**
 * Ein Passwort, das niemand kennt – auch dieser Vorgang nicht, sobald die
 * Zeile durch ist.
 *
 * `password_hash` ist NOT NULL, und daran soll sich nichts ändern: die Spalte
 * nullable zu machen hiesse, den Anmeldepfad für einen Fall anzufassen, der
 * gar nicht bis dorthin kommt. Also bekommt das frische Konto einen Hash über
 * 32 zufällige Byte. Es ist damit nicht anmeldbar, bis die Einladung
 * eingelöst ist, und das ohne Sonderfall in der Anmeldung.
 */
function unusablePassword(): Promise<string> {
  return hashPassword(randomBytes(32).toString("base64url"));
}

/**
 * Legt ein Login-Konto (Rolle FACHKRAFT) für eine bestehende Fachkraft an und
 * verknüpft es über caregiver.userId.
 *
 * Läuft komplett in einer Tenant-Transaktion (withTenant): das Konto entsteht
 * in derselben Organisation wie die Fachkraft, RLS erzwingt die Isolation.
 * Schlägt die Verknüpfung fehl, wird auch der User zurückgerollt – es bleibt
 * kein verwaistes Konto zurück.
 *
 * Es wird KEIN Passwort erzeugt. Früher gab dieser Endpunkt eines im Klartext
 * zurück; der Admin kannte damit das Geheimnis der Fachkraft und konnte sich
 * vor ihr in ihrem Namen anmelden – womit alles, was danach unter ihrem Namen
 * im Audit-Log steht, ihr nicht mehr sicher zuzurechnen ist. Stattdessen
 * entsteht ein Einladungslink; das Passwort wählt sie selbst, und niemand
 * sonst kennt es je.
 */
export async function createFachkraftUser(
  ctx: TenantContext,
  input: CreateFachkraftUserInput,
): Promise<FachkraftAccount> {
  // Vor der Transaktion: Argon2id braucht rund 100 ms, die gehören nicht in
  // eine offene Transaktion.
  const passwordHash = await unusablePassword();

  return withTenant(ctx.organizationId, async (tx) => {
    const caregiver = await tx.caregiver.findFirst({
      where: { id: input.caregiverId, organizationId: ctx.organizationId },
      select: { id: true, userId: true, isActive: true },
    });
    if (!caregiver) throw new AppError(404, "Fachkraft nicht gefunden", "NotFound");
    if (!caregiver.isActive) {
      throw new AppError(422, "Fachkraft ist deaktiviert", "UnprocessableEntity");
    }
    if (caregiver.userId) {
      throw new ConflictError("Fachkraft hat bereits ein Benutzerkonto");
    }

    // E-Mail ist pro Tenant eindeutig (@@unique([organizationId, email])).
    // Expliziter Check für eine sprechende Meldung; der Unique-Index bleibt
    // die eigentliche Absicherung gegen Races.
    const emailTaken = await tx.user.findFirst({
      where: { organizationId: ctx.organizationId, email: input.email },
      select: { id: true },
    });
    if (emailTaken) {
      throw new ConflictError("E-Mail ist in dieser Organisation bereits vergeben");
    }

    const user = await tx.user.create({
      data: {
        organizationId: ctx.organizationId,
        role: UserRole.FACHKRAFT,
        email: input.email,
        passwordHash,
        language: input.language,
        // Doppelter Boden: das Konto ist ohnehin nicht anmeldbar, solange die
        // Einladung offen ist. Sollte je auf anderem Weg ein Passwort gesetzt
        // werden, greift wenigstens der erzwungene Wechsel.
        mustChangePassword: true,
      },
      select: { id: true, email: true, role: true, organizationId: true, language: true },
    });

    await tx.caregiver.update({ where: { id: caregiver.id }, data: { userId: user.id } });

    const invitation = await issueInvitation(tx, ctx, {
      userId: user.id,
      language: user.language,
    });

    await writeAudit(tx, ctx, {
      action: AuditAction.CREATE,
      entityType: "user",
      entityId: user.id,
      // Niemals das Token (auch nicht dessen Hash) ins Audit-Log schreiben.
      metadata: { role: UserRole.FACHKRAFT, caregiverId: caregiver.id, invited: true },
    });

    return {
      user,
      caregiverId: caregiver.id,
      invitationUrl: invitation.url,
      invitationExpiresAt: invitation.expiresAt,
    };
  });
}

export interface ReissuedInvitation {
  user: AccountUser;
  invitationUrl: string;
  invitationExpiresAt: Date;
  /** Anzahl der dabei beendeten Sitzungen (widerrufene Refresh-Token). */
  revokedSessions: number;
  /**
   * false = die Sperrliste war nicht erreichbar. Die Refresh-Token sind
   * trotzdem widerrufen, ein bereits ausgestelltes Access-Token bleibt aber
   * bis zu seinem Ablauf gültig.
   */
  accessRevokedImmediately: boolean;
}

/**
 * Stellt einen neuen Einladungslink für ein bestehendes Fachkraft-Konto aus
 * (der erste kam nie an, ist abgelaufen, oder das Gerät ging verloren).
 *
 * Tritt an die Stelle des früheren Passwort-Resets: dort erzeugte der Server
 * ein neues temporäres Passwort und gab es dem Admin zurück – mit demselben
 * Zurechnungsproblem wie beim Anlegen.
 *
 * Bewusst auf Rolle FACHKRAFT beschränkt: sonst könnte HR einen Zugang zu
 * einem Struktur-Admin-Konto ausstellen, ihn selbst einlösen und sich als
 * dieser anmelden – eine Rechteausweitung.
 *
 * Das bisherige Passwort bleibt bis zum Einlösen gültig. Die laufenden
 * Sitzungen werden dagegen sofort beendet: der häufigste Anlass ist ein
 * verlorenes Gerät, und dort darf nichts offen bleiben, während der Link noch
 * unterwegs ist.
 */
export async function reissueInvitation(
  ctx: TenantContext,
  userId: string,
): Promise<ReissuedInvitation> {
  const result = await withTenant(ctx.organizationId, async (tx) => {
    const existing = await tx.user.findFirst({
      where: { id: userId, organizationId: ctx.organizationId },
      select: { id: true, email: true, role: true, organizationId: true, language: true },
    });
    if (!existing) throw new AppError(404, "Benutzerkonto nicht gefunden", "NotFound");
    if (existing.role !== UserRole.FACHKRAFT) {
      throw new ForbiddenError("Nur für Fachkraft-Konten möglich");
    }

    const invitation = await issueInvitation(tx, ctx, {
      userId: existing.id,
      language: existing.language,
    });

    const revoked = await tx.refreshToken.updateMany({
      where: { userId: existing.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    await writeAudit(tx, ctx, {
      action: AuditAction.UPDATE,
      entityType: "user",
      entityId: existing.id,
      metadata: { operation: "invitation_reissued", revokedSessions: revoked.count },
    });

    return { user: existing, invitation, revokedSessions: revoked.count };
  });

  // Nach dem Commit: bereits ausgestellte Access-Token sofort entwerten. Vor dem
  // Commit wäre der Schnitt umsonst, falls die Transaktion noch scheitert – und
  // ein Redis-Aufruf hätte die Transaktion unnötig offen gehalten.
  const accessRevokedImmediately = await revokeAccessTokensBefore(result.user.id);

  return {
    user: result.user,
    invitationUrl: result.invitation.url,
    invitationExpiresAt: result.invitation.expiresAt,
    revokedSessions: result.revokedSessions,
    accessRevokedImmediately,
  };
}
