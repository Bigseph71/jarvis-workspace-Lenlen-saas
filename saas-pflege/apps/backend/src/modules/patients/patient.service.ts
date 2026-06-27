import { AuditAction, GeocodingStatus, withTenant, type Prisma } from "@len-len/database";
import { AppError } from "../../lib/errors.js";
import { writeAudit } from "../../lib/audit.js";
import { paginated, toSkipTake, type Paginated } from "../../lib/pagination.js";
import { enqueueGeocode } from "../../lib/queue.js";
import type { TenantContext, TenantTx } from "../../lib/context.js";
import type {
  CreatePatientInput,
  UpdatePatientInput,
  ListPatientsQuery,
} from "./patient.schemas.js";

/** Stellt sicher, dass die zugewiesene Fachkraft zum Tenant gehört und aktiv ist. */
async function assertCaregiverInTenant(tx: TenantTx, caregiverId: string): Promise<void> {
  const caregiver = await tx.caregiver.findFirst({
    where: { id: caregiverId, isActive: true },
    select: { id: true },
  });
  if (!caregiver) {
    throw new AppError(422, "Zugewiesene Fachkraft nicht gefunden oder inaktiv", "UnprocessableEntity");
  }
}

export async function listPatients(
  ctx: TenantContext,
  query: ListPatientsQuery,
): Promise<Paginated<unknown>> {
  return withTenant(ctx.organizationId, async (tx) => {
    const where: Prisma.PatientWhereInput = {
      organizationId: ctx.organizationId,
      ...(query.includeInactive ? {} : { isActive: true }),
      ...(query.geocodingStatus ? { geocodingStatus: query.geocodingStatus } : {}),
      ...(query.search
        ? {
            OR: [
              { firstName: { contains: query.search, mode: "insensitive" } },
              { lastName: { contains: query.search, mode: "insensitive" } },
            ],
          }
        : {}),
    };

    const [data, total] = await Promise.all([
      tx.patient.findMany({
        where,
        orderBy: { lastName: "asc" },
        ...toSkipTake(query),
      }),
      tx.patient.count({ where }),
    ]);

    return paginated(data, total, query);
  });
}

export async function getPatient(ctx: TenantContext, id: string): Promise<unknown> {
  return withTenant(ctx.organizationId, async (tx) => {
    const patient = await tx.patient.findFirst({
      where: { id, organizationId: ctx.organizationId },
      include: { assignedCaregiver: { select: { id: true, firstName: true, lastName: true } } },
    });
    if (!patient) throw new AppError(404, "Patient nicht gefunden", "NotFound");

    // DSGVO: Lesezugriff auf Patientendaten protokollieren.
    await writeAudit(tx, ctx, { action: AuditAction.READ, entityType: "patient", entityId: id });
    return patient;
  });
}

export async function createPatient(ctx: TenantContext, input: CreatePatientInput): Promise<unknown> {
  const patient = await withTenant(ctx.organizationId, async (tx) => {
    if (input.assignedCaregiverId) {
      await assertCaregiverInTenant(tx, input.assignedCaregiverId);
    }

    const created = await tx.patient.create({
      data: {
        organizationId: ctx.organizationId,
        firstName: input.firstName,
        lastName: input.lastName,
        rawAddress: input.rawAddress,
        assignedCaregiverId: input.assignedCaregiverId ?? null,
        geocodingStatus: GeocodingStatus.PENDING,
      },
    });

    await writeAudit(tx, ctx, {
      action: AuditAction.CREATE,
      entityType: "patient",
      entityId: created.id,
    });
    return created;
  });

  // Adresse asynchron geokodieren (best-effort, blockiert den Request nicht).
  await enqueueGeocode({ organizationId: ctx.organizationId, patientId: patient.id });
  return patient;
}

export async function updatePatient(
  ctx: TenantContext,
  id: string,
  input: UpdatePatientInput,
): Promise<unknown> {
  const { patient, addressChanged } = await withTenant(ctx.organizationId, async (tx) => {
    const existing = await tx.patient.findFirst({
      where: { id, organizationId: ctx.organizationId },
      select: { id: true, rawAddress: true },
    });
    if (!existing) throw new AppError(404, "Patient nicht gefunden", "NotFound");

    if (input.assignedCaregiverId) {
      await assertCaregiverInTenant(tx, input.assignedCaregiverId);
    }

    // Adressänderung erzwingt erneutes Geocoding.
    const changed = input.rawAddress !== undefined && input.rawAddress !== existing.rawAddress;

    const updated = await tx.patient.update({
      where: { id },
      data: {
        ...input,
        ...(changed
          ? { geocodingStatus: GeocodingStatus.PENDING, latitude: null, longitude: null, geocodingScore: null }
          : {}),
      },
    });

    await writeAudit(tx, ctx, { action: AuditAction.UPDATE, entityType: "patient", entityId: id });
    return { patient: updated, addressChanged: changed };
  });

  if (addressChanged) {
    await enqueueGeocode({ organizationId: ctx.organizationId, patientId: id });
  }
  return patient;
}

/** Soft-Delete: deaktiviert den Patienten, erhält Besuchshistorie. */
export async function deactivatePatient(ctx: TenantContext, id: string): Promise<void> {
  await withTenant(ctx.organizationId, async (tx) => {
    const result = await tx.patient.updateMany({
      where: { id, organizationId: ctx.organizationId, isActive: true },
      data: { isActive: false },
    });
    if (result.count === 0) throw new AppError(404, "Patient nicht gefunden", "NotFound");

    await writeAudit(tx, ctx, { action: AuditAction.DELETE, entityType: "patient", entityId: id });
  });
}
