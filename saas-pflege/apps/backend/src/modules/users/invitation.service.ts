import { AuditAction, prisma, type Locale } from "@len-len/database";
import { AppError } from "../../lib/errors.js";
import { writeAudit } from "../../lib/audit.js";
import { hashPassword } from "../../lib/password.js";
import { revokeAccessTokensBefore } from "../../lib/token-revocation.js";
import {
  generateInvitation,
  hashInvitationToken,
  invitationUrl,
} from "../../lib/invitation.js";
import type { TenantContext, TenantTx } from "../../lib/context.js";
import { isInvitationUsable, type InvitationState } from "./invitation.rules.js";

export interface IssuedInvitation {
  /** Der Link, den der Admin weitergibt. Nur in dieser einen Antwort. */
  url: string;
  expiresAt: Date;
}

/**
 * Stellt eine Einladung für ein Konto aus.
 *
 * Läuft in der Transaktion des Aufrufers (Konto anlegen oder Zugang neu
 * ausstellen), damit nie eine Einladung ohne Konto oder ein Konto ohne
 * Zugangsweg entsteht.
 *
 * Offene Einladungen desselben Kontos werden dabei entwertet. Sonst blieben
 * nach einem zweiten Ausstellen zwei gültige Links im Umlauf – und der Grund,
 * einen neuen auszustellen, ist meist gerade, dass der erste in falsche Hände
 * geraten sein könnte.
 */
export async function issueInvitation(
  tx: TenantTx,
  ctx: TenantContext,
  params: { userId: string; language: Locale },
): Promise<IssuedInvitation> {
  const invitation = generateInvitation();

  await tx.userInvitation.updateMany({
    where: { userId: params.userId, usedAt: null, expiresAt: { gt: new Date() } },
    data: { expiresAt: new Date() },
  });

  await tx.userInvitation.create({
    data: {
      organizationId: ctx.organizationId,
      userId: params.userId,
      tokenHash: invitation.tokenHash,
      expiresAt: invitation.expiresAt,
      createdByUserId: ctx.userId,
    },
  });

  return {
    url: invitationUrl(invitation.token, params.language),
    expiresAt: invitation.expiresAt,
  };
}

export interface InvitationPreview {
  email: string;
  organizationName: string;
  expiresAt: Date;
}

/**
 * Was der Einladungsbildschirm vor der Eingabe anzeigt.
 *
 * Läuft über den System-Pfad (kein withTenant): zu diesem Zeitpunkt ist kein
 * Tenant bekannt, genau wie beim Login. Gesucht wird über den Hash – der
 * Klartext des Tokens steht nirgends in der Datenbank.
 *
 * Die E-Mail wird gezeigt, damit die Empfängerin sieht, welches Konto sie
 * gerade aktiviert. Wer den Link hat, ist der beabsichtigte Empfänger; ohne
 * ihn erfährt niemand etwas.
 */
export async function previewInvitation(token: string): Promise<InvitationPreview> {
  const invitation = await prisma.userInvitation.findUnique({
    where: { tokenHash: hashInvitationToken(token) },
    select: {
      usedAt: true,
      expiresAt: true,
      user: { select: { email: true, isActive: true } },
      organization: { select: { name: true, deletedAt: true } },
    },
  });

  assertUsable(invitation);

  return {
    email: invitation.user.email,
    organizationName: invitation.organization.name,
    expiresAt: invitation.expiresAt,
  };
}

type UsableInvitation = InvitationState & {
  user: { email: string; isActive: boolean };
  organization: { name: string; deletedAt: Date | null };
};

/**
 * Ein Link ist entweder brauchbar oder nicht – und warum, wird nicht
 * unterschieden.
 *
 * Alle Fälle enden in derselben 404 mit derselben Meldung: abgelaufen, schon
 * benutzt, erfunden, oder zu einem deaktivierten Konto gehörend. Eine
 * gesprächigere Antwort machte den Endpunkt zum Auskunftsdienst darüber,
 * welche Token einmal existiert haben.
 */
function assertUsable(
  invitation: UsableInvitation | null,
): asserts invitation is UsableInvitation {
  if (!isInvitationUsable(invitation)) {
    throw new AppError(
      404,
      "Dieser Einladungslink ist nicht mehr gültig",
      "InvitationNotFound",
    );
  }
}

export interface AcceptedInvitation {
  email: string;
}

/**
 * Setzt das Passwort und verbraucht die Einladung.
 *
 * Meldet bewusst NICHT an: Fachkräfte arbeiten in der App, nicht im Web (siehe
 * RBAC). Ein hier ausgestelltes Token-Paar wäre für den Browser, in dem sie
 * gerade steht, wertlos – und der Weg bliebe trotzdem ein öffentlicher
 * Endpunkt, der Sitzungen ausgibt. Nach dem Setzen steht sie vor der
 * Anmeldung, mit einem Passwort, das nur sie kennt.
 */
export async function acceptInvitation(
  token: string,
  password: string,
): Promise<AcceptedInvitation> {
  const tokenHash = hashInvitationToken(token);

  const result = await prisma.$transaction(async (tx) => {
    const invitation = await tx.userInvitation.findUnique({
      where: { tokenHash },
      select: {
        id: true,
        organizationId: true,
        userId: true,
        usedAt: true,
        expiresAt: true,
        user: { select: { email: true, isActive: true } },
        organization: { select: { name: true, deletedAt: true } },
      },
    });

    assertUsable(invitation);

    // Erst entwerten, dann das Passwort setzen: updateMany mit der Bedingung
    // `usedAt: null` ist die Sperre gegen zwei gleichzeitige Einlösungen.
    // Greift sie nicht, war ein anderer Aufruf schneller.
    const consumed = await tx.userInvitation.updateMany({
      where: { id: invitation.id, usedAt: null },
      data: { usedAt: new Date() },
    });
    if (consumed.count === 0) {
      throw new AppError(
        404,
        "Dieser Einladungslink ist nicht mehr gültig",
        "InvitationNotFound",
      );
    }

    await tx.user.update({
      where: { id: invitation.userId },
      data: {
        passwordHash: await hashPassword(password),
        // Sie hat es selbst gewählt – es gibt nichts mehr zu wechseln.
        mustChangePassword: false,
      },
    });

    // Laufende Sitzungen beenden. Der häufigste Anlass für eine zweite
    // Einladung ist ein verlorenes Gerät; bliebe dessen Sitzung bestehen,
    // änderte das neue Passwort daran nichts.
    await tx.refreshToken.updateMany({
      where: { userId: invitation.userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    await writeAudit(
      tx as TenantTx,
      { organizationId: invitation.organizationId, userId: invitation.userId },
      {
        action: AuditAction.UPDATE,
        entityType: "user",
        entityId: invitation.userId,
        metadata: { operation: "invitation_accepted" },
      },
    );

    return { userId: invitation.userId, email: invitation.user.email };
  });

  await revokeAccessTokensBefore(result.userId);

  return { email: result.email };
}
