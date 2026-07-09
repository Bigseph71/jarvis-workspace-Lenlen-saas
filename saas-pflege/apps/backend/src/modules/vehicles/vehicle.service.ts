import { AuditAction, withTenant, type Prisma, type Vehicle } from "@len-len/database";
import { AppError } from "../../lib/errors.js";
import { writeAudit } from "../../lib/audit.js";
import { paginated, toSkipTake, type Paginated } from "../../lib/pagination.js";
import { assertWithinPlan } from "../billing/limits.js";
import type { TenantContext } from "../../lib/context.js";
import {
  pickVehicleForTrip,
  usagePercent,
  vehicleAlerts,
  vehicleStatus,
} from "./vehicle.rules.js";
import type {
  CreateVehicleInput,
  UpdateVehicleInput,
  ListVehiclesQuery,
} from "./vehicle.schemas.js";

/** Fahrzeug + berechnete Leasing-Kennzahlen (Auslastung, Alerts, Badge). */
function enrich(v: Vehicle, now: Date) {
  return {
    ...v,
    usagePercent: Math.round(usagePercent(v.leasingKmUsed, v.leasingKmLimit)),
    alerts: vehicleAlerts(v, now),
    status: vehicleStatus(v, now),
  };
}

export async function listVehicles(
  ctx: TenantContext,
  query: ListVehiclesQuery,
): Promise<Paginated<unknown>> {
  return withTenant(ctx.organizationId, async (tx) => {
    const where: Prisma.VehicleWhereInput = {
      organizationId: ctx.organizationId,
      ...(query.includeInactive ? {} : { isActive: true }),
      ...(query.search ? { label: { contains: query.search, mode: "insensitive" } } : {}),
    };
    const now = new Date();
    const [data, total] = await Promise.all([
      tx.vehicle.findMany({ where, orderBy: { label: "asc" }, ...toSkipTake(query) }),
      tx.vehicle.count({ where }),
    ]);
    return paginated(
      data.map((v) => enrich(v, now)),
      total,
      query,
    );
  });
}

export async function getVehicle(ctx: TenantContext, id: string): Promise<unknown> {
  return withTenant(ctx.organizationId, async (tx) => {
    const vehicle = await tx.vehicle.findFirst({ where: { id, organizationId: ctx.organizationId } });
    if (!vehicle) throw new AppError(404, "Fahrzeug nicht gefunden", "NotFound");
    return enrich(vehicle, new Date());
  });
}

export async function createVehicle(ctx: TenantContext, input: CreateVehicleInput): Promise<unknown> {
  return withTenant(ctx.organizationId, async (tx) => {
    await assertWithinPlan(tx, ctx.organizationId, "vehicles");
    const vehicle = await tx.vehicle.create({
      data: {
        organizationId: ctx.organizationId,
        label: input.label,
        leasingKmLimit: input.leasingKmLimit,
        leasingKmUsed: input.leasingKmUsed ?? 0,
        leasingEndDate: input.leasingEndDate ?? null,
      },
    });
    await writeAudit(tx, ctx, { action: AuditAction.CREATE, entityType: "vehicle", entityId: vehicle.id });
    return enrich(vehicle, new Date());
  });
}

export async function updateVehicle(
  ctx: TenantContext,
  id: string,
  input: UpdateVehicleInput,
): Promise<unknown> {
  return withTenant(ctx.organizationId, async (tx) => {
    const existing = await tx.vehicle.findFirst({
      where: { id, organizationId: ctx.organizationId },
      select: { id: true },
    });
    if (!existing) throw new AppError(404, "Fahrzeug nicht gefunden", "NotFound");

    const vehicle = await tx.vehicle.update({
      where: { id },
      data: {
        label: input.label,
        leasingKmLimit: input.leasingKmLimit,
        // undefined = unverändert lassen, null = Datum löschen.
        ...(input.leasingEndDate !== undefined ? { leasingEndDate: input.leasingEndDate } : {}),
      },
    });
    await writeAudit(tx, ctx, { action: AuditAction.UPDATE, entityType: "vehicle", entityId: id });
    return enrich(vehicle, new Date());
  });
}

/** Regel 6: Kilometerstand nach einer Tour erhöhen. */
export async function addKm(ctx: TenantContext, id: string, km: number): Promise<unknown> {
  return withTenant(ctx.organizationId, async (tx) => {
    const existing = await tx.vehicle.findFirst({
      where: { id, organizationId: ctx.organizationId },
      select: { id: true },
    });
    if (!existing) throw new AppError(404, "Fahrzeug nicht gefunden", "NotFound");

    const vehicle = await tx.vehicle.update({
      where: { id },
      data: { leasingKmUsed: { increment: km } },
    });
    await writeAudit(tx, ctx, {
      action: AuditAction.UPDATE,
      entityType: "vehicle",
      entityId: id,
      metadata: { event: "add_km", km, total: vehicle.leasingKmUsed },
    });
    return enrich(vehicle, new Date());
  });
}

/** Soft-Delete: deaktiviert das Fahrzeug. */
export async function deactivateVehicle(ctx: TenantContext, id: string): Promise<void> {
  await withTenant(ctx.organizationId, async (tx) => {
    const result = await tx.vehicle.updateMany({
      where: { id, organizationId: ctx.organizationId, isActive: true },
      data: { isActive: false },
    });
    if (result.count === 0) throw new AppError(404, "Fahrzeug nicht gefunden", "NotFound");
    await writeAudit(tx, ctx, { action: AuditAction.DELETE, entityType: "vehicle", entityId: id });
  });
}

/**
 * Regel 6 für den VRPTW: liefert für eine Fahrt der Länge `km` das am wenigsten
 * genutzte aktive Fahrzeug mit ausreichender Restkapazität.
 */
export async function assignRoute(ctx: TenantContext, km: number): Promise<unknown> {
  return withTenant(ctx.organizationId, async (tx) => {
    const vehicles = await tx.vehicle.findMany({
      where: { organizationId: ctx.organizationId, isActive: true },
    });
    const pick = pickVehicleForTrip(vehicles, km);
    if (!pick) throw new AppError(404, "Kein aktives Fahrzeug verfügbar", "NotFound");
    return {
      vehicle: enrich(pick.vehicle, new Date()),
      sufficientCapacity: pick.sufficientCapacity,
    };
  });
}
