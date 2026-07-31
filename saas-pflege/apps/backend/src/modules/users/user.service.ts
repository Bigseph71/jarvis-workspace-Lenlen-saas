import { AuditAction, UserRole, withTenant, type Locale } from "@len-len/database";
import { AppError, ConflictError, ForbiddenError } from "../../lib/errors.js";
import { generateTemporaryPassword, hashPassword } from "../../lib/password.js";
import { writeAudit } from "../../lib/audit.js";
import type { TenantContext } from "../../lib/context.js";
import type { CreateFachkraftUserInput } from "./user.schemas.js";

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
   * Klartext-Passwort – existiert NUR in dieser Antwort und wird nirgends
   * gespeichert oder geloggt. MVP: der Admin gibt es an die Fachkraft weiter.
   * TODO: per E-Mail zustellen, sobald ein Mail-Versand konfiguriert ist.
   */
  temporaryPassword: string;
}

/**
 * Legt ein Login-Konto (Rolle FACHKRAFT) für eine bestehende Fachkraft an und
 * verknüpft es über caregiver.userId.
 *
 * Läuft komplett in einer Tenant-Transaktion (withTenant): das Konto entsteht
 * in derselben Organisation wie die Fachkraft, RLS erzwingt die Isolation.
 * Schlägt die Verknüpfung fehl, wird auch der User zurückgerollt – es bleibt
 * kein verwaistes Konto zurück.
 */
export async function createFachkraftUser(
  ctx: TenantContext,
  input: CreateFachkraftUserInput,
): Promise<FachkraftAccount> {
  const temporaryPassword = generateTemporaryPassword();
  const passwordHash = await hashPassword(temporaryPassword);

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
        // Temporäres Passwort: muss beim ersten Login gewechselt werden.
        mustChangePassword: true,
      },
      select: { id: true, email: true, role: true, organizationId: true, language: true },
    });

    await tx.caregiver.update({ where: { id: caregiver.id }, data: { userId: user.id } });

    await writeAudit(tx, ctx, {
      action: AuditAction.CREATE,
      entityType: "user",
      entityId: user.id,
      // Niemals das Passwort (auch nicht den Hash) ins Audit-Log schreiben.
      metadata: { role: UserRole.FACHKRAFT, caregiverId: caregiver.id },
    });

    return { user, caregiverId: caregiver.id, temporaryPassword };
  });
}

export interface PasswordReset {
  user: AccountUser;
  /** Siehe FachkraftAccount.temporaryPassword: nur hier, nirgends gespeichert. */
  temporaryPassword: string;
  /** Anzahl der dabei beendeten Sitzungen (widerrufene Refresh-Token). */
  revokedSessions: number;
}

/**
 * Setzt das Passwort eines Fachkraft-Kontos auf ein neues temporäres Passwort
 * zurück (z.B. wenn das erste nie ankam oder das Gerät verloren ging).
 *
 * Bewusst auf Rolle FACHKRAFT beschränkt: sonst könnte HR das Passwort eines
 * Struktur-Admins zurücksetzen, das Ergebnis aus der Antwort lesen und sich als
 * dieser anmelden – eine Rechteausweitung.
 *
 * Alle aktiven Refresh-Token werden widerrufen, sonst überlebt eine bestehende
 * Sitzung auf dem verlorenen Gerät den Reset.
 */
export async function resetFachkraftPassword(
  ctx: TenantContext,
  userId: string,
): Promise<PasswordReset> {
  const temporaryPassword = generateTemporaryPassword();
  const passwordHash = await hashPassword(temporaryPassword);

  return withTenant(ctx.organizationId, async (tx) => {
    const existing = await tx.user.findFirst({
      where: { id: userId, organizationId: ctx.organizationId },
      select: { id: true, role: true },
    });
    if (!existing) throw new AppError(404, "Benutzerkonto nicht gefunden", "NotFound");
    if (existing.role !== UserRole.FACHKRAFT) {
      throw new ForbiddenError("Nur Fachkraft-Konten können hier zurückgesetzt werden");
    }

    const user = await tx.user.update({
      where: { id: existing.id },
      // Wie beim Anlegen: das neue Passwort ist temporär.
      data: { passwordHash, mustChangePassword: true },
      select: { id: true, email: true, role: true, organizationId: true, language: true },
    });

    const revoked = await tx.refreshToken.updateMany({
      where: { userId: existing.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    await writeAudit(tx, ctx, {
      action: AuditAction.UPDATE,
      entityType: "user",
      entityId: user.id,
      metadata: { operation: "password_reset", revokedSessions: revoked.count },
    });

    return { user, temporaryPassword, revokedSessions: revoked.count };
  });
}
