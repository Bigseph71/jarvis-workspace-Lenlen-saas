import { z } from "zod";
import type { FastifyInstance } from "fastify";
import { UserRole } from "@len-len/database";
import { authenticate } from "../../plugins/authenticate.js";
import { requireRole } from "../../plugins/rbac.js";
import type { TenantContext } from "../../lib/context.js";
import {
  createCaregiverSchema,
  updateCaregiverSchema,
  updateContractSchema,
  listCaregiversQuerySchema,
} from "./caregiver.schemas.js";
import {
  listCaregivers,
  getCaregiver,
  createCaregiver,
  updateCaregiver,
  updateContract,
  deactivateCaregiver,
} from "./caregiver.service.js";

const idParamSchema = z.object({ id: z.string().uuid() });

// Lesen: Admin, Koordinator, HR. Schreiben/Verträge: Admin + HR (Vertragsmodul).
const canRead = requireRole(
  UserRole.SUPER_ADMIN,
  UserRole.STRUKTUR_ADMIN,
  UserRole.KOORDINATOR,
  UserRole.HR,
);
const canWrite = requireRole(UserRole.SUPER_ADMIN, UserRole.STRUKTUR_ADMIN, UserRole.HR);

function ctxFrom(req: { user?: { userId: string; organizationId: string } }): TenantContext {
  return { organizationId: req.user!.organizationId, userId: req.user!.userId };
}

export async function caregiverRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", authenticate);

  app.get("/caregivers", { preHandler: [canRead] }, async (request) => {
    const query = listCaregiversQuerySchema.parse(request.query);
    return listCaregivers(ctxFrom(request), query);
  });

  app.get("/caregivers/:id", { preHandler: [canRead] }, async (request) => {
    const { id } = idParamSchema.parse(request.params);
    return getCaregiver(ctxFrom(request), id);
  });

  app.post("/caregivers", { preHandler: [canWrite] }, async (request, reply) => {
    const input = createCaregiverSchema.parse(request.body);
    const caregiver = await createCaregiver(ctxFrom(request), input);
    return reply.status(201).send(caregiver);
  });

  app.patch("/caregivers/:id", { preHandler: [canWrite] }, async (request) => {
    const { id } = idParamSchema.parse(request.params);
    const input = updateCaregiverSchema.parse(request.body);
    return updateCaregiver(ctxFrom(request), id, input);
  });

  // Vertragsmodul (HR).
  app.put("/caregivers/:id/contract", { preHandler: [canWrite] }, async (request) => {
    const { id } = idParamSchema.parse(request.params);
    const input = updateContractSchema.parse(request.body);
    return updateContract(ctxFrom(request), id, input);
  });

  app.delete("/caregivers/:id", { preHandler: [canWrite] }, async (request, reply) => {
    const { id } = idParamSchema.parse(request.params);
    await deactivateCaregiver(ctxFrom(request), id);
    return reply.status(204).send();
  });
}
