import { AuditAction, GeocodingStatus, withTenant } from "@len-len/database";
import { AppError, ForbiddenError } from "../../lib/errors.js";
import { writeAudit } from "../../lib/audit.js";
import type { TenantContext } from "../../lib/context.js";
import { evaluateGeofence, type LatLng } from "../../lib/tracking/geofence.js";
import { latestPerCaregiver } from "../../lib/tracking/scope.js";
import { publishPosition, type TrackingEvent } from "../../lib/realtime.js";
import type { PostPositionInput } from "./tracking.schemas.js";

/** Zeitfenster, in dem eine Position als "live" gilt (Minuten). */
const LIVE_WINDOW_MINUTES = 15;

export interface PositionResult {
  id: string;
  caregiverId: string;
  visitId: string | null;
  latitude: number;
  longitude: number;
  accuracy: number | null;
  distanceToPatientM: number | null;
  geofenceBreach: boolean;
  recordedAt: string;
}

/**
 * Nimmt eine Positionsmeldung der eingeloggten Fachkraft entgegen, bewertet die
 * Geofence gegen den Patienten des aktiven Besuchs, speichert den Punkt
 * (DSGVO-Audit) und pusht ihn an die Koordination.
 * Die caregiverId wird IMMER serverseitig aus dem Konto abgeleitet – ein Client
 * kann keine fremde Position melden.
 */
export async function recordPosition(
  ctx: TenantContext,
  input: PostPositionInput,
): Promise<PositionResult> {
  const recordedAt = input.recordedAt ? new Date(input.recordedAt) : new Date();

  const result = await withTenant(ctx.organizationId, async (tx) => {
    const caregiver = await tx.caregiver.findFirst({
      where: { userId: ctx.userId, organizationId: ctx.organizationId },
      select: { id: true },
    });
    if (!caregiver) throw new ForbiddenError("Kein Fachkraft-Profil mit deinem Konto verknüpft");

    // Patienten-Referenz für die Geofence: nur der eigene, valide geokodierte
    // Besuch zählt. Fremder Besuch -> Ablehnung (keine Fremd-Verknüpfung).
    let patient: LatLng | null = null;
    let visitId: string | null = null;
    if (input.visitId) {
      const visit = await tx.visit.findFirst({
        where: { id: input.visitId, organizationId: ctx.organizationId, caregiverId: caregiver.id },
        select: {
          id: true,
          patient: { select: { latitude: true, longitude: true, geocodingStatus: true } },
        },
      });
      if (!visit) throw new AppError(404, "Aktiver Besuch nicht gefunden", "NotFound");
      visitId = visit.id;
      if (
        visit.patient.geocodingStatus === GeocodingStatus.VALID &&
        visit.patient.latitude !== null &&
        visit.patient.longitude !== null
      ) {
        patient = { lat: Number(visit.patient.latitude), lng: Number(visit.patient.longitude) };
      }
    }

    const { distanceM, breach } = evaluateGeofence(
      { lat: input.latitude, lng: input.longitude },
      patient,
    );

    const created = await tx.gpsPosition.create({
      data: {
        organizationId: ctx.organizationId,
        caregiverId: caregiver.id,
        visitId,
        latitude: input.latitude,
        longitude: input.longitude,
        accuracy: input.accuracy ?? null,
        distanceToPatientM: distanceM,
        geofenceBreach: breach,
        recordedAt,
      },
      select: { id: true },
    });

    // DSGVO: Erfassung von Standortdaten wird protokolliert.
    await writeAudit(tx, ctx, {
      action: AuditAction.CREATE,
      entityType: "gps_position",
      entityId: created.id,
      metadata: { event: "gps_track", visitId, geofenceBreach: breach, distanceToPatientM: distanceM },
    });

    return {
      id: created.id,
      caregiverId: caregiver.id,
      visitId,
      latitude: input.latitude,
      longitude: input.longitude,
      accuracy: input.accuracy ?? null,
      distanceToPatientM: distanceM,
      geofenceBreach: breach,
      recordedAt: recordedAt.toISOString(),
    } satisfies PositionResult;
  });

  // Live-Push an die Koordination (best-effort, außerhalb der TX).
  const event: TrackingEvent = {
    caregiverId: result.caregiverId,
    visitId: result.visitId,
    latitude: result.latitude,
    longitude: result.longitude,
    accuracy: result.accuracy,
    distanceToPatientM: result.distanceToPatientM,
    geofenceBreach: result.geofenceBreach,
    recordedAt: result.recordedAt,
  };
  await publishPosition(ctx.organizationId, event);

  return result;
}

export interface LivePosition extends PositionResult {
  caregiver: { id: string; firstName: string; lastName: string };
}

/**
 * Jüngste Position je Fachkraft der Organisation innerhalb des Live-Fensters
 * (Snapshot für die Koordination beim Öffnen der Karte / WS-Verbindung).
 */
export async function livePositions(ctx: TenantContext): Promise<LivePosition[]> {
  const since = new Date(Date.now() - LIVE_WINDOW_MINUTES * 60_000);

  const rows = await withTenant(ctx.organizationId, async (tx) =>
    tx.gpsPosition.findMany({
      where: { organizationId: ctx.organizationId, recordedAt: { gte: since } },
      orderBy: { recordedAt: "desc" },
      select: {
        id: true,
        caregiverId: true,
        visitId: true,
        latitude: true,
        longitude: true,
        accuracy: true,
        distanceToPatientM: true,
        geofenceBreach: true,
        recordedAt: true,
        caregiver: { select: { id: true, firstName: true, lastName: true } },
      },
    }),
  );

  return latestPerCaregiver(rows).map((r) => ({
    id: r.id,
    caregiverId: r.caregiverId,
    visitId: r.visitId,
    latitude: Number(r.latitude),
    longitude: Number(r.longitude),
    accuracy: r.accuracy,
    distanceToPatientM: r.distanceToPatientM,
    geofenceBreach: r.geofenceBreach,
    recordedAt: r.recordedAt.toISOString(),
    caregiver: r.caregiver,
  }));
}
