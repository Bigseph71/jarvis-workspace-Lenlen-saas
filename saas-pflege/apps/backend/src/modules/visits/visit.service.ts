import {
  AuditAction,
  VisitStatus,
  withTenant,
  type Prisma,
  type Qualification,
} from "@len-len/database";
import { AppError, ConflictError, ForbiddenError } from "../../lib/errors.js";
import { writeAudit } from "../../lib/audit.js";
import { paginated, toSkipTake, type Paginated } from "../../lib/pagination.js";
import { weekRange, dayRange, weekdayCode } from "../../lib/week.js";
import type { TenantContext, TenantTx } from "../../lib/context.js";
import type {
  CreateVisitInput,
  CreateEmergencyVisitInput,
  RescheduleVisitInput,
  ListVisitsQuery,
} from "./visit.schemas.js";

// Status, die eine Wochenbelegung "verbrauchen" (CANCELED/MISSED zählen nicht).
const ACTIVE_STATUSES: VisitStatus[] = [
  VisitStatus.PLANNED,
  VisitStatus.IN_PROGRESS,
  VisitStatus.COMPLETED,
];

interface CaregiverCore {
  id: string;
  qualification: Qualification;
  workDays: Prisma.JsonValue;
  isActive: boolean;
}

function workDaysOf(caregiver: { workDays: Prisma.JsonValue }): string[] {
  return Array.isArray(caregiver.workDays) ? (caregiver.workDays as string[]) : [];
}

async function loadActiveCaregiver(tx: TenantTx, id: string): Promise<CaregiverCore> {
  const caregiver = await tx.caregiver.findFirst({
    where: { id, isActive: true },
    select: { id: true, qualification: true, workDays: true, isActive: true },
  });
  if (!caregiver) {
    throw new AppError(422, "Fachkraft nicht gefunden oder inaktiv", "UnprocessableEntity");
  }
  return caregiver;
}

/** Regel métier 1: max. 1 regulärer Besuch pro Patient und ISO-Woche. */
async function assertNoWeeklyClash(
  tx: TenantTx,
  organizationId: string,
  patientId: string,
  scheduledAt: Date,
  excludeVisitId?: string,
): Promise<void> {
  const { start, end } = weekRange(scheduledAt);
  const clash = await tx.visit.findFirst({
    where: {
      organizationId,
      patientId,
      isEmergency: false,
      status: { in: ACTIVE_STATUSES },
      scheduledAt: { gte: start, lt: end },
      ...(excludeVisitId ? { id: { not: excludeVisitId } } : {}),
    },
    select: { id: true },
  });
  if (clash) {
    throw new ConflictError("Patient hat in dieser Woche bereits einen regulären Besuch");
  }
}

/** Regel métier 5 (Teil): Besuch nur an einem Arbeitstag der Fachkraft. */
function assertWorkDay(caregiver: { workDays: Prisma.JsonValue }, scheduledAt: Date): void {
  const code = weekdayCode(scheduledAt);
  if (!workDaysOf(caregiver).includes(code)) {
    throw new AppError(422, `Fachkraft arbeitet nicht am ${code}`, "UnprocessableEntity");
  }
}

/** Regel métier 4: Vertretung muss dieselbe Qualifikation wie die Stammkraft haben. */
function assertSameQualification(replacement: CaregiverCore, attitre: CaregiverCore): void {
  if (replacement.qualification !== attitre.qualification) {
    throw new AppError(
      422,
      "Vertretung benötigt dieselbe Qualifikation wie die Stamm-Fachkraft",
      "UnprocessableEntity",
    );
  }
}

const VISIT_INCLUDE = {
  patient: { select: { id: true, firstName: true, lastName: true } },
  caregiver: { select: { id: true, firstName: true, lastName: true, userId: true } },
  assignedCaregiver: { select: { id: true, firstName: true, lastName: true } },
} satisfies Prisma.VisitInclude;

/** Regulärer Besuch (Wochenzyklus). */
export async function createVisit(ctx: TenantContext, input: CreateVisitInput): Promise<unknown> {
  return withTenant(ctx.organizationId, async (tx) => {
    const patient = await tx.patient.findFirst({
      where: { id: input.patientId, organizationId: ctx.organizationId, isActive: true },
      select: { id: true, assignedCaregiverId: true },
    });
    if (!patient) throw new AppError(422, "Patient nicht gefunden oder inaktiv", "UnprocessableEntity");

    const attitreId = input.assignedCaregiverId ?? patient.assignedCaregiverId;
    if (!attitreId) {
      throw new AppError(422, "Patient hat keine Stamm-Fachkraft", "UnprocessableEntity");
    }
    const attitre = await loadActiveCaregiver(tx, attitreId);

    // Effektive Fachkraft (ggf. Vertretung).
    const effectiveId = input.caregiverId ?? attitreId;
    const effective = effectiveId === attitreId ? attitre : await loadActiveCaregiver(tx, effectiveId);
    if (effectiveId !== attitreId) {
      assertSameQualification(effective, attitre);
    }

    assertWorkDay(effective, input.scheduledAt);
    await assertNoWeeklyClash(tx, ctx.organizationId, input.patientId, input.scheduledAt);

    const visit = await tx.visit.create({
      data: {
        organizationId: ctx.organizationId,
        patientId: input.patientId,
        assignedCaregiverId: attitreId,
        caregiverId: effectiveId,
        scheduledAt: input.scheduledAt,
        status: VisitStatus.PLANNED,
        isEmergency: false,
      },
      include: VISIT_INCLUDE,
    });

    await writeAudit(tx, ctx, { action: AuditAction.CREATE, entityType: "visit", entityId: visit.id });
    return visit;
  });
}

/** Regel métier 2: Notfallbesuch, außerhalb des Zyklus, Motiv verpflichtend. */
export async function createEmergencyVisit(
  ctx: TenantContext,
  input: CreateEmergencyVisitInput,
): Promise<unknown> {
  return withTenant(ctx.organizationId, async (tx) => {
    const patient = await tx.patient.findFirst({
      where: { id: input.patientId, organizationId: ctx.organizationId, isActive: true },
      select: { id: true, assignedCaregiverId: true },
    });
    if (!patient) throw new AppError(422, "Patient nicht gefunden oder inaktiv", "UnprocessableEntity");

    // Notfall darf abweichende Qualifikation/Arbeitstage haben (out of cycle).
    if (input.caregiverId) await loadActiveCaregiver(tx, input.caregiverId);

    const visit = await tx.visit.create({
      data: {
        organizationId: ctx.organizationId,
        patientId: input.patientId,
        assignedCaregiverId: patient.assignedCaregiverId,
        caregiverId: input.caregiverId ?? null,
        scheduledAt: input.scheduledAt,
        status: VisitStatus.PLANNED,
        isEmergency: true,
        emergencyReason: input.emergencyReason,
      },
      include: VISIT_INCLUDE,
    });

    await writeAudit(tx, ctx, {
      action: AuditAction.CREATE,
      entityType: "visit",
      entityId: visit.id,
      metadata: { emergency: true, reason: input.emergencyReason },
    });
    return visit;
  });
}

export async function listVisits(
  ctx: TenantContext,
  query: ListVisitsQuery,
): Promise<Paginated<unknown>> {
  return withTenant(ctx.organizationId, async (tx) => {
    const where: Prisma.VisitWhereInput = {
      organizationId: ctx.organizationId,
      ...(query.patientId ? { patientId: query.patientId } : {}),
      ...(query.caregiverId ? { caregiverId: query.caregiverId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.includeEmergency ? {} : { isEmergency: false }),
      ...(query.from || query.to
        ? { scheduledAt: { ...(query.from ? { gte: query.from } : {}), ...(query.to ? { lt: query.to } : {}) } }
        : {}),
    };

    const [data, total] = await Promise.all([
      tx.visit.findMany({ where, orderBy: { scheduledAt: "asc" }, include: VISIT_INCLUDE, ...toSkipTake(query) }),
      tx.visit.count({ where }),
    ]);
    return paginated(data, total, query);
  });
}

export async function getVisit(ctx: TenantContext, id: string): Promise<unknown> {
  return withTenant(ctx.organizationId, async (tx) => {
    const visit = await tx.visit.findFirst({
      where: { id, organizationId: ctx.organizationId },
      include: VISIT_INCLUDE,
    });
    if (!visit) throw new AppError(404, "Besuch nicht gefunden", "NotFound");
    return visit;
  });
}

export async function rescheduleVisit(
  ctx: TenantContext,
  id: string,
  input: RescheduleVisitInput,
): Promise<unknown> {
  return withTenant(ctx.organizationId, async (tx) => {
    const visit = await tx.visit.findFirst({
      where: { id, organizationId: ctx.organizationId },
      select: { id: true, status: true, isEmergency: true, patientId: true, caregiverId: true },
    });
    if (!visit) throw new AppError(404, "Besuch nicht gefunden", "NotFound");
    if (visit.status === VisitStatus.COMPLETED || visit.status === VisitStatus.CANCELED) {
      throw new ConflictError("Abgeschlossener oder stornierter Besuch kann nicht verschoben werden");
    }

    if (!visit.isEmergency) {
      if (visit.caregiverId) {
        const caregiver = await loadActiveCaregiver(tx, visit.caregiverId);
        assertWorkDay(caregiver, input.scheduledAt);
      }
      await assertNoWeeklyClash(tx, ctx.organizationId, visit.patientId, input.scheduledAt, id);
    }

    const updated = await tx.visit.update({
      where: { id },
      data: { scheduledAt: input.scheduledAt },
      include: VISIT_INCLUDE,
    });
    await writeAudit(tx, ctx, { action: AuditAction.UPDATE, entityType: "visit", entityId: id });
    return updated;
  });
}

/** Vertretung zuweisen (Regel métier 4 + Nachvollziehbarkeit). */
export async function assignCaregiver(
  ctx: TenantContext,
  id: string,
  caregiverId: string,
): Promise<unknown> {
  return withTenant(ctx.organizationId, async (tx) => {
    const visit = await tx.visit.findFirst({
      where: { id, organizationId: ctx.organizationId },
      select: { id: true, status: true, assignedCaregiverId: true, scheduledAt: true },
    });
    if (!visit) throw new AppError(404, "Besuch nicht gefunden", "NotFound");
    if (visit.status === VisitStatus.COMPLETED || visit.status === VisitStatus.CANCELED) {
      throw new ConflictError("Status erlaubt keine Neuzuweisung");
    }

    const replacement = await loadActiveCaregiver(tx, caregiverId);
    if (visit.assignedCaregiverId) {
      const attitre = await loadActiveCaregiver(tx, visit.assignedCaregiverId);
      assertSameQualification(replacement, attitre);
      assertWorkDay(replacement, visit.scheduledAt);
    }

    const updated = await tx.visit.update({
      where: { id },
      data: { caregiverId },
      include: VISIT_INCLUDE,
    });
    await writeAudit(tx, ctx, {
      action: AuditAction.UPDATE,
      entityType: "visit",
      entityId: id,
      metadata: { reassignedTo: caregiverId },
    });
    return updated;
  });
}

interface OwnershipOpts {
  /** Wenn gesetzt (FACHKRAFT), muss der Besuch dieser User-ID gehören. */
  enforceOwnerUserId?: string;
}

async function loadVisitForStatus(tx: TenantTx, organizationId: string, id: string, opts: OwnershipOpts) {
  const visit = await tx.visit.findFirst({
    where: { id, organizationId },
    select: { id: true, status: true, caregiver: { select: { userId: true } } },
  });
  if (!visit) throw new AppError(404, "Besuch nicht gefunden", "NotFound");
  if (opts.enforceOwnerUserId && visit.caregiver?.userId !== opts.enforceOwnerUserId) {
    throw new ForbiddenError("Besuch ist nicht dir zugewiesen");
  }
  return visit;
}

export async function checkIn(ctx: TenantContext, id: string, opts: OwnershipOpts = {}): Promise<unknown> {
  return withTenant(ctx.organizationId, async (tx) => {
    const visit = await loadVisitForStatus(tx, ctx.organizationId, id, opts);
    if (visit.status !== VisitStatus.PLANNED) {
      throw new ConflictError("Nur geplante Besuche können gestartet werden");
    }
    const updated = await tx.visit.update({
      where: { id },
      data: { status: VisitStatus.IN_PROGRESS, gpsArrivalAt: new Date() },
      include: VISIT_INCLUDE,
    });
    await writeAudit(tx, ctx, { action: AuditAction.UPDATE, entityType: "visit", entityId: id, metadata: { event: "check_in" } });
    return updated;
  });
}

export async function checkOut(ctx: TenantContext, id: string, opts: OwnershipOpts = {}): Promise<unknown> {
  return withTenant(ctx.organizationId, async (tx) => {
    const visit = await loadVisitForStatus(tx, ctx.organizationId, id, opts);
    if (visit.status !== VisitStatus.IN_PROGRESS) {
      throw new ConflictError("Nur laufende Besuche können beendet werden");
    }
    const updated = await tx.visit.update({
      where: { id },
      data: { status: VisitStatus.COMPLETED, gpsDepartureAt: new Date() },
      include: VISIT_INCLUDE,
    });
    await writeAudit(tx, ctx, { action: AuditAction.UPDATE, entityType: "visit", entityId: id, metadata: { event: "check_out" } });
    return updated;
  });
}

export async function cancelVisit(ctx: TenantContext, id: string): Promise<unknown> {
  return withTenant(ctx.organizationId, async (tx) => {
    const result = await tx.visit.updateMany({
      where: { id, organizationId: ctx.organizationId, status: { in: [VisitStatus.PLANNED, VisitStatus.IN_PROGRESS] } },
      data: { status: VisitStatus.CANCELED },
    });
    if (result.count === 0) {
      throw new ConflictError("Besuch nicht gefunden oder nicht stornierbar");
    }
    await writeAudit(tx, ctx, { action: AuditAction.UPDATE, entityType: "visit", entityId: id, metadata: { event: "cancel" } });
    return tx.visit.findFirst({ where: { id, organizationId: ctx.organizationId }, include: VISIT_INCLUDE });
  });
}

/** Regel métier 3: aktive Patienten ohne regulären Besuch in der Woche. */
export async function patientsMissingWeeklyVisit(ctx: TenantContext, weekOf: Date): Promise<unknown> {
  return withTenant(ctx.organizationId, async (tx) => {
    const { start, end } = weekRange(weekOf);
    const patients = await tx.patient.findMany({
      where: {
        organizationId: ctx.organizationId,
        isActive: true,
        visits: {
          none: {
            isEmergency: false,
            status: { in: ACTIVE_STATUSES },
            scheduledAt: { gte: start, lt: end },
          },
        },
      },
      select: { id: true, firstName: true, lastName: true, assignedCaregiverId: true },
      orderBy: { lastName: "asc" },
    });
    return { week: { start, end }, count: patients.length, patients };
  });
}

/** Tagesroute der eingeloggten Fachkraft (Mobile-App). */
export async function myVisitsForDay(ctx: TenantContext, date: Date): Promise<unknown> {
  return withTenant(ctx.organizationId, async (tx) => {
    const caregiver = await tx.caregiver.findFirst({
      where: { userId: ctx.userId, organizationId: ctx.organizationId },
      select: { id: true },
    });
    if (!caregiver) throw new ForbiddenError("Kein Fachkraft-Profil mit deinem Konto verknüpft");

    const { start, end } = dayRange(date);
    const visits = await tx.visit.findMany({
      where: {
        organizationId: ctx.organizationId,
        caregiverId: caregiver.id,
        scheduledAt: { gte: start, lt: end },
        status: { not: VisitStatus.CANCELED },
      },
      orderBy: { scheduledAt: "asc" },
      include: VISIT_INCLUDE,
    });
    return { date: start, count: visits.length, visits };
  });
}
