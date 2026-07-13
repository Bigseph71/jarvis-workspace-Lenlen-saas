import { AuditAction, GeocodingStatus, VisitStatus, withTenant } from "@len-len/database";
import { AppError } from "../../lib/errors.js";
import { writeAudit } from "../../lib/audit.js";
import { env } from "../../config/env.js";
import type { TenantContext } from "../../lib/context.js";
import { solveVrptw, type Stop } from "../../lib/vrptw/solver.js";
import { pickVehicleForTrip } from "../vehicles/vehicle.rules.js";

export interface OptimizeResult {
  routeId: string;
  order: string[];
  totalKm: number;
  score: number;
  partial: boolean;
  vehicleId: string | null;
  /** false, wenn kein Fahrzeug die Strecke im Leasing-Rahmen fahren kann. */
  sufficientCapacity: boolean;
  visitCount: number;
}

/** Tagesfenster [00:00, +24h) in UTC für ein @db.Date. */
function dayWindow(date: Date): { start: Date; end: Date } {
  const start = new Date(date);
  start.setUTCHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  return { start, end };
}

/**
 * Optimiert eine Tour (Route) per VRPTW-Solver und schreibt das Ergebnis zurück.
 *
 * Ablauf (kurze Transaktionen, Rechnung dazwischen ohne offene TX – wie beim
 * Geocoding):
 *   1) Route + zugehörige Besuche + aktive Fahrzeuge lesen.
 *   2) Regel 7: blockieren, sobald ein Patient nicht valide geokodiert ist.
 *   3) Solver mit Sicherheits-Deadline (VRPTW_TIMEOUT_MS) laufen lassen.
 *   4) Regel 6: Fahrzeug mit den wenigsten km für die Strecke wählen.
 *   5) Route (Reihenfolge, Score, km, Fahrzeug) + Besuchs-Verknüpfung schreiben.
 */
export async function optimizeRoute(ctx: TenantContext, routeId: string): Promise<OptimizeResult> {
  // 1) Lesen (kurze TX)
  const data = await withTenant(ctx.organizationId, async (tx) => {
    const route = await tx.route.findFirst({
      where: { id: routeId, organizationId: ctx.organizationId },
      select: { id: true, caregiverId: true, date: true },
    });
    if (!route) throw new AppError(404, "Tour nicht gefunden", "NotFound");

    const { start, end } = dayWindow(route.date);
    // Besuche der Tour: bereits verknüpfte ODER am Tourtag von der Fachkraft
    // durchzuführende (noch nicht verworfene) Besuche.
    const visits = await tx.visit.findMany({
      where: {
        organizationId: ctx.organizationId,
        status: { not: VisitStatus.CANCELED },
        OR: [
          { routeId: route.id },
          ...(route.caregiverId
            ? [{ caregiverId: route.caregiverId, scheduledAt: { gte: start, lt: end } }]
            : []),
        ],
      },
      select: {
        id: true,
        scheduledAt: true,
        patient: {
          select: { id: true, latitude: true, longitude: true, geocodingStatus: true },
        },
      },
      orderBy: { scheduledAt: "asc" },
    });

    const vehicles = await tx.vehicle.findMany({
      where: { organizationId: ctx.organizationId, isActive: true },
      select: { id: true, leasingKmUsed: true, leasingKmLimit: true, leasingEndDate: true },
    });

    return { route, visits, vehicles };
  });

  const { route, visits, vehicles } = data;

  // Leere Tour: nichts zu optimieren, aber als optimiert markieren (idempotent).
  if (visits.length === 0) {
    return persistResult(ctx, {
      routeId: route.id,
      order: [],
      totalKm: 0,
      score: 100,
      partial: false,
      vehicleId: null,
      sufficientCapacity: true,
      visitCount: 0,
      visitIds: [],
    });
  }

  // 2) Regel 7: Optimierung ist blockiert, solange ein Patient nicht valide
  // geokodiert ist (INVALID oder noch PENDING ohne Koordinaten).
  const blocking = visits.filter(
    (v) =>
      v.patient.geocodingStatus !== GeocodingStatus.VALID ||
      v.patient.latitude === null ||
      v.patient.longitude === null,
  );
  if (blocking.length > 0) {
    throw new AppError(
      409,
      `Optimierung blockiert: ${blocking.length} Patient(en) ohne gültige Geokodierung.`,
      "GeocodingIncomplete",
    );
  }

  // 3) Solver (ohne offene TX). Deadline = jetzt + konfiguriertes Timeout.
  const stops: Stop[] = visits.map((v) => ({
    visitId: v.id,
    lat: Number(v.patient.latitude),
    lng: Number(v.patient.longitude),
  }));
  const solution = solveVrptw(stops, { deadline: Date.now() + env.VRPTW_TIMEOUT_MS });

  // 4) Regel 6: Fahrzeug mit den wenigsten genutzten km für die Strecke.
  const pick = pickVehicleForTrip(vehicles, solution.totalKm);

  // 5) Schreiben (kurze TX) + Audit
  return persistResult(ctx, {
    routeId: route.id,
    order: solution.order,
    totalKm: solution.totalKm,
    score: solution.score,
    partial: solution.partial,
    vehicleId: pick?.vehicle.id ?? null,
    sufficientCapacity: pick?.sufficientCapacity ?? false,
    visitCount: visits.length,
    visitIds: visits.map((v) => v.id),
  });
}

export interface RouteStatus {
  id: string;
  caregiverId: string | null;
  vehicleId: string | null;
  date: string;
  visitsOrder: string[];
  optimized: boolean;
  vrptwScore: number | null;
  totalKm: number | null;
}

/** Aktueller Zustand einer Tour (für Status-Polling durch das Frontend). */
export async function getRoute(ctx: TenantContext, routeId: string): Promise<RouteStatus> {
  return withTenant(ctx.organizationId, async (tx) => {
    const route = await tx.route.findFirst({
      where: { id: routeId, organizationId: ctx.organizationId },
      select: {
        id: true,
        caregiverId: true,
        vehicleId: true,
        date: true,
        visitsOrder: true,
        optimized: true,
        vrptwScore: true,
        totalKm: true,
      },
    });
    if (!route) throw new AppError(404, "Tour nicht gefunden", "NotFound");

    return {
      id: route.id,
      caregiverId: route.caregiverId,
      vehicleId: route.vehicleId,
      date: route.date.toISOString().slice(0, 10),
      visitsOrder: Array.isArray(route.visitsOrder) ? (route.visitsOrder as string[]) : [],
      optimized: route.optimized,
      vrptwScore: route.vrptwScore === null ? null : Number(route.vrptwScore),
      totalKm: route.totalKm === null ? null : Number(route.totalKm),
    };
  });
}

/** Schreibt das Optimierungsergebnis in Route + verknüpft die Besuche. */
async function persistResult(
  ctx: TenantContext,
  r: OptimizeResult & { visitIds: string[] },
): Promise<OptimizeResult> {
  await withTenant(ctx.organizationId, async (tx) => {
    await tx.route.update({
      where: { id: r.routeId },
      data: {
        visitsOrder: r.order,
        optimized: true,
        vrptwScore: r.score,
        totalKm: r.totalKm,
        vehicleId: r.vehicleId,
      },
    });

    if (r.visitIds.length > 0) {
      await tx.visit.updateMany({
        where: { id: { in: r.visitIds }, organizationId: ctx.organizationId },
        data: { routeId: r.routeId },
      });
    }

    await writeAudit(tx, ctx, {
      action: AuditAction.UPDATE,
      entityType: "route",
      entityId: r.routeId,
      metadata: {
        event: "vrptw_optimize",
        totalKm: r.totalKm,
        score: r.score,
        partial: r.partial,
        vehicleId: r.vehicleId,
        sufficientCapacity: r.sufficientCapacity,
        visitCount: r.visitCount,
      },
    });
  });

  const { visitIds: _drop, ...result } = r;
  return result;
}
