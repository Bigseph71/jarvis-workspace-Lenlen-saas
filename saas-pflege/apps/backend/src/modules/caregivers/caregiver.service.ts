import { AuditAction, withTenant, type Prisma } from "@len-len/database";
import { AppError, ConflictError } from "../../lib/errors.js";
import { writeAudit } from "../../lib/audit.js";
import { paginated, toSkipTake, type Paginated } from "../../lib/pagination.js";
import { assertWithinPlan } from "../billing/limits.js";
import type { TenantContext, TenantTx } from "../../lib/context.js";
import type {
  CreateCaregiverInput,
  UpdateCaregiverInput,
  UpdateContractInput,
  ListCaregiversQuery,
} from "./caregiver.schemas.js";

/** Prüft, dass das Benutzerkonto zum Tenant gehört und noch frei ist. */
async function assertUserLinkable(tx: TenantTx, userId: string, excludeCaregiverId?: string): Promise<void> {
  const user = await tx.user.findFirst({ where: { id: userId }, select: { id: true } });
  if (!user) throw new AppError(422, "Benutzerkonto nicht gefunden", "UnprocessableEntity");

  const linked = await tx.caregiver.findFirst({
    where: { userId, ...(excludeCaregiverId ? { id: { not: excludeCaregiverId } } : {}) },
    select: { id: true },
  });
  if (linked) throw new ConflictError("Benutzerkonto ist bereits einer Fachkraft zugeordnet");
}

export async function listCaregivers(
  ctx: TenantContext,
  query: ListCaregiversQuery,
): Promise<Paginated<unknown>> {
  return withTenant(ctx.organizationId, async (tx) => {
    const where: Prisma.CaregiverWhereInput = {
      organizationId: ctx.organizationId,
      ...(query.includeInactive ? {} : { isActive: true }),
      ...(query.qualification ? { qualification: query.qualification } : {}),
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
      tx.caregiver.findMany({ where, orderBy: { lastName: "asc" }, ...toSkipTake(query) }),
      tx.caregiver.count({ where }),
    ]);

    return paginated(data, total, query);
  });
}

export async function getCaregiver(ctx: TenantContext, id: string): Promise<unknown> {
  return withTenant(ctx.organizationId, async (tx) => {
    const caregiver = await tx.caregiver.findFirst({
      where: { id, organizationId: ctx.organizationId },
      include: { _count: { select: { assignedPatients: true } } },
    });
    if (!caregiver) throw new AppError(404, "Fachkraft nicht gefunden", "NotFound");
    return caregiver;
  });
}

export async function createCaregiver(ctx: TenantContext, input: CreateCaregiverInput): Promise<unknown> {
  return withTenant(ctx.organizationId, async (tx) => {
    await assertWithinPlan(tx, ctx.organizationId, "caregivers");
    if (input.userId) await assertUserLinkable(tx, input.userId);

    const caregiver = await tx.caregiver.create({
      data: {
        organizationId: ctx.organizationId,
        firstName: input.firstName,
        lastName: input.lastName,
        qualification: input.qualification,
        userId: input.userId ?? null,
        contractType: input.contractType,
        weeklyHours: input.weeklyHours,
        workDays: input.workDays,
        maxPatients: input.maxPatients,
      },
    });

    await writeAudit(tx, ctx, {
      action: AuditAction.CREATE,
      entityType: "caregiver",
      entityId: caregiver.id,
    });
    return caregiver;
  });
}

export async function updateCaregiver(
  ctx: TenantContext,
  id: string,
  input: UpdateCaregiverInput,
): Promise<unknown> {
  return withTenant(ctx.organizationId, async (tx) => {
    const existing = await tx.caregiver.findFirst({
      where: { id, organizationId: ctx.organizationId },
      select: { id: true },
    });
    if (!existing) throw new AppError(404, "Fachkraft nicht gefunden", "NotFound");

    if (input.userId) await assertUserLinkable(tx, input.userId, id);

    const caregiver = await tx.caregiver.update({ where: { id }, data: input });
    await writeAudit(tx, ctx, { action: AuditAction.UPDATE, entityType: "caregiver", entityId: id });
    return caregiver;
  });
}

/** Vertragsmodul: aktualisiert nur den Vertrags-Block. */
export async function updateContract(
  ctx: TenantContext,
  id: string,
  input: UpdateContractInput,
): Promise<unknown> {
  return withTenant(ctx.organizationId, async (tx) => {
    const result = await tx.caregiver.updateMany({
      where: { id, organizationId: ctx.organizationId },
      data: {
        contractType: input.contractType,
        weeklyHours: input.weeklyHours,
        workDays: input.workDays,
        maxPatients: input.maxPatients,
      },
    });
    if (result.count === 0) throw new AppError(404, "Fachkraft nicht gefunden", "NotFound");

    await writeAudit(tx, ctx, {
      action: AuditAction.UPDATE,
      entityType: "caregiver_contract",
      entityId: id,
      metadata: { contractType: input.contractType, weeklyHours: input.weeklyHours },
    });

    return tx.caregiver.findFirstOrThrow({ where: { id } });
  });
}

/** Soft-Delete: deaktiviert die Fachkraft. */
export async function deactivateCaregiver(ctx: TenantContext, id: string): Promise<void> {
  await withTenant(ctx.organizationId, async (tx) => {
    const result = await tx.caregiver.updateMany({
      where: { id, organizationId: ctx.organizationId, isActive: true },
      data: { isActive: false },
    });
    if (result.count === 0) throw new AppError(404, "Fachkraft nicht gefunden", "NotFound");

    await writeAudit(tx, ctx, { action: AuditAction.DELETE, entityType: "caregiver", entityId: id });
  });
}
