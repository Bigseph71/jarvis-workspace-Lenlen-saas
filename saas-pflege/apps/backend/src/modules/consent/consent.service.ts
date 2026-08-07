import { AuditAction, withTenant } from "@len-len/database";
import { AppError, ForbiddenError } from "../../lib/errors.js";
import { writeAudit } from "../../lib/audit.js";
import type { TenantContext, TenantTx } from "../../lib/context.js";
import { GPS_POLICY_VERSION } from "./consent.policy.js";
import type { GrantGpsConsentInput } from "./consent.schemas.js";

/** Fehlercode, an dem die Mobile-App den Einwilligungs-Dialog öffnet. */
export const GPS_CONSENT_MISSING = "GpsConsentMissing";

/** Fachkraft-Profil des eingeloggten Kontos, oder 403. */
async function requireOwnCaregiver(tx: TenantTx, ctx: TenantContext): Promise<string> {
  const caregiver = await tx.caregiver.findFirst({
    where: { userId: ctx.userId, organizationId: ctx.organizationId },
    select: { id: true },
  });
  if (!caregiver) throw new ForbiddenError("Kein Fachkraft-Profil mit deinem Konto verknüpft");
  return caregiver.id;
}

/**
 * Deckt eine wirksame Einwilligung die Standorterfassung dieser Fachkraft?
 *
 * Geprüft wird gegen die AKTUELLE Textversion: eine Zustimmung zu einem
 * früheren Text deckt einen geänderten nicht (Art. 7 Abs. 2). Läuft im
 * Tenant-Kontext, damit die RLS greift.
 */
export async function hasActiveGpsConsent(
  tx: TenantTx,
  organizationId: string,
  caregiverId: string,
): Promise<boolean> {
  const active = await tx.gpsConsent.findFirst({
    where: {
      organizationId,
      caregiverId,
      revokedAt: null,
      policyVersion: GPS_POLICY_VERSION,
    },
    select: { id: true },
    orderBy: { grantedAt: "desc" },
  });
  return active !== null;
}

export interface GpsConsentStatus {
  /** true = Tracking zulässig. */
  granted: boolean;
  /** Version, der zugestimmt wurde (null, wenn nie zugestimmt). */
  acceptedVersion: string | null;
  /** Aktuell gültige Textversion – die App zeigt genau diesen Text. */
  currentVersion: string;
  grantedAt: string | null;
  revokedAt: string | null;
}

/**
 * Einwilligungsstand der eingeloggten Fachkraft. Grundlage für den Dialog in
 * der App: `granted=false` bei vorhandener `acceptedVersion` bedeutet, dass
 * der Text sich geändert hat und erneut zuzustimmen ist.
 */
export async function getGpsConsentStatus(ctx: TenantContext): Promise<GpsConsentStatus> {
  return withTenant(ctx.organizationId, async (tx) => {
    const caregiverId = await requireOwnCaregiver(tx, ctx);

    // Jüngste Zeile überhaupt: sie beschreibt den aktuellen Stand, auch wenn
    // sie widerrufen oder veraltet ist (die App unterscheidet die Fälle).
    const latest = await tx.gpsConsent.findFirst({
      where: { organizationId: ctx.organizationId, caregiverId },
      orderBy: { grantedAt: "desc" },
      select: { policyVersion: true, grantedAt: true, revokedAt: true },
    });

    const granted = await hasActiveGpsConsent(tx, ctx.organizationId, caregiverId);

    return {
      granted,
      acceptedVersion: latest?.policyVersion ?? null,
      currentVersion: GPS_POLICY_VERSION,
      grantedAt: latest?.grantedAt.toISOString() ?? null,
      revokedAt: latest?.revokedAt?.toISOString() ?? null,
    };
  });
}

/**
 * Erteilt die Einwilligung. Legt IMMER eine neue Zeile an, überschreibt nie:
 * die Historie ist der Nachweis (Art. 7 Abs. 1).
 *
 * Die vom Client gemeldete Version muss der aktuellen entsprechen. Eine
 * veraltete App könnte sonst einen alten Text anzeigen und eine Zustimmung
 * einsammeln, die den tatsächlich geltenden Text nie erwähnt hat.
 */
export async function grantGpsConsent(
  ctx: TenantContext,
  input: GrantGpsConsentInput,
): Promise<GpsConsentStatus> {
  if (input.policyVersion !== GPS_POLICY_VERSION) {
    throw new AppError(
      409,
      `Veraltete Einwilligungsversion (${input.policyVersion}); aktuell ist ${GPS_POLICY_VERSION}. Bitte App aktualisieren.`,
      "ConsentVersionMismatch",
    );
  }

  await withTenant(ctx.organizationId, async (tx) => {
    const caregiverId = await requireOwnCaregiver(tx, ctx);

    const created = await tx.gpsConsent.create({
      data: {
        organizationId: ctx.organizationId,
        caregiverId,
        policyVersion: input.policyVersion,
        locale: input.locale,
      },
      select: { id: true },
    });

    await writeAudit(tx, ctx, {
      action: AuditAction.CREATE,
      entityType: "gps_consent",
      entityId: created.id,
      metadata: { event: "gps_consent_granted", policyVersion: input.policyVersion, locale: input.locale },
    });
  });

  return getGpsConsentStatus(ctx);
}

/**
 * Widerruft die Einwilligung (Art. 7 Abs. 3 – jederzeit und so einfach wie die
 * Erteilung). Wirkt nur für die Zukunft: bereits erfasste Positionen wurden
 * rechtmäßig erhoben und werden hier NICHT gelöscht. Ihre Entfernung ist ein
 * eigener Vorgang (Löschkonzept / Recht auf Vergessenwerden).
 *
 * updateMany über ALLE offenen Zeilen: mehrfache Erteilung (z.B. auf zwei
 * Geräten) hinterlässt mehrere offene Zeilen, ein Widerruf muss sie alle
 * schließen – sonst bliebe die Erfassung gedeckt.
 */
export async function revokeGpsConsent(ctx: TenantContext): Promise<GpsConsentStatus> {
  await withTenant(ctx.organizationId, async (tx) => {
    const caregiverId = await requireOwnCaregiver(tx, ctx);

    const { count } = await tx.gpsConsent.updateMany({
      where: { organizationId: ctx.organizationId, caregiverId, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    // Auch ein wirkungsloser Widerruf wird protokolliert: dass jemand ihn
    // ausgelöst hat, ist die nachweisrelevante Tatsache, nicht die Zeilenzahl.
    await writeAudit(tx, ctx, {
      action: AuditAction.UPDATE,
      entityType: "gps_consent",
      metadata: { event: "gps_consent_revoked", revokedRows: count },
    });
  });

  return getGpsConsentStatus(ctx);
}
