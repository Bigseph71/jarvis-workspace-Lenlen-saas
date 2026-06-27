import { AuditAction, GeocodingStatus, withTenant } from "@len-len/database";
import { AppError } from "../../lib/errors.js";
import { writeAudit } from "../../lib/audit.js";
import type { TenantContext } from "../../lib/context.js";
import { getGeocodingProvider } from "../../lib/geocoding/index.js";
import type { GeocodingProvider } from "../../lib/geocoding/types.js";

export interface GeocodeOutcome {
  patientId: string;
  status: GeocodingStatus;
}

/**
 * Geokodiert die Adresse eines Patienten und schreibt das Ergebnis zurück.
 * Der externe HTTP-Call läuft BEWUSST außerhalb der Transaktion (kurze TX).
 */
export async function geocodePatient(
  ctx: TenantContext,
  patientId: string,
  provider: GeocodingProvider = getGeocodingProvider(),
): Promise<GeocodeOutcome> {
  // 1) Adresse lesen (kurze TX)
  const rawAddress = await withTenant(ctx.organizationId, async (tx) => {
    const patient = await tx.patient.findFirst({
      where: { id: patientId, organizationId: ctx.organizationId },
      select: { rawAddress: true },
    });
    if (!patient) throw new AppError(404, "Patient nicht gefunden", "NotFound");
    return patient.rawAddress;
  });

  // 2) Externer Geocoding-Call (ohne offene TX)
  const result = await provider.geocode(rawAddress);

  // 3) Ergebnis schreiben (kurze TX) + Audit
  return withTenant(ctx.organizationId, async (tx) => {
    const updated = await tx.patient.update({
      where: { id: patientId },
      data: result
        ? {
            latitude: result.latitude,
            longitude: result.longitude,
            geocodingScore: result.score,
            normalizedAddress: result.normalizedAddress,
            geocodingStatus: GeocodingStatus.VALID,
          }
        : {
            geocodingStatus: GeocodingStatus.INVALID,
            latitude: null,
            longitude: null,
            geocodingScore: null,
          },
      select: { id: true, geocodingStatus: true },
    });

    await writeAudit(tx, ctx, {
      action: AuditAction.UPDATE,
      entityType: "patient",
      entityId: patientId,
      metadata: { event: "geocode", provider: provider.name, status: updated.geocodingStatus },
    });

    return { patientId, status: updated.geocodingStatus };
  });
}

export interface ProcessPendingResult {
  processed: number;
  valid: number;
  invalid: number;
}

/** Geokodiert die noch ausstehenden (PENDING) Patienten eines Tenants. */
export async function processPendingForOrg(
  ctx: TenantContext,
  limit = 50,
): Promise<ProcessPendingResult> {
  const pending = await withTenant(ctx.organizationId, async (tx) =>
    tx.patient.findMany({
      where: {
        organizationId: ctx.organizationId,
        isActive: true,
        geocodingStatus: GeocodingStatus.PENDING,
      },
      select: { id: true },
      take: limit,
    }),
  );

  let valid = 0;
  let invalid = 0;
  for (const { id } of pending) {
    const outcome = await geocodePatient(ctx, id);
    if (outcome.status === GeocodingStatus.VALID) valid += 1;
    else invalid += 1;
  }

  return { processed: pending.length, valid, invalid };
}
