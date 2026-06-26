import { z } from "zod";
import type { FastifyInstance } from "fastify";
import { UserRole } from "@len-len/database";
import { authenticate } from "../../plugins/authenticate.js";
import { requireRole } from "../../plugins/rbac.js";
import type { TenantContext } from "../../lib/context.js";
import {
  createPatientSchema,
  updatePatientSchema,
  listPatientsQuerySchema,
} from "./patient.schemas.js";
import {
  listPatients,
  getPatient,
  createPatient,
  updatePatient,
  deactivatePatient,
} from "./patient.service.js";

const idParamSchema = z.object({ id: z.string().uuid() });

// HR hat laut RBAC KEINEN Zugriff auf Patientendaten; Fachkraft nur Mobile-App.
const canManage = requireRole(UserRole.SUPER_ADMIN, UserRole.STRUKTUR_ADMIN, UserRole.KOORDINATOR);

function ctxFrom(req: { user?: { userId: string; organizationId: string } }): TenantContext {
  return { organizationId: req.user!.organizationId, userId: req.user!.userId };
}

export async function patientRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", authenticate);

  app.get("/patients", { preHandler: [canManage] }, async (request) => {
    const query = listPatientsQuerySchema.parse(request.query);
    return listPatients(ctxFrom(request), query);
  });

  app.get("/patients/:id", { preHandler: [canManage] }, async (request) => {
    const { id } = idParamSchema.parse(request.params);
    return getPatient(ctxFrom(request), id);
  });

  app.post("/patients", { preHandler: [canManage] }, async (request, reply) => {
    const input = createPatientSchema.parse(request.body);
    const patient = await createPatient(ctxFrom(request), input);
    return reply.status(201).send(patient);
  });

  app.patch("/patients/:id", { preHandler: [canManage] }, async (request) => {
    const { id } = idParamSchema.parse(request.params);
    const input = updatePatientSchema.parse(request.body);
    return updatePatient(ctxFrom(request), id, input);
  });

  app.delete("/patients/:id", { preHandler: [canManage] }, async (request, reply) => {
    const { id } = idParamSchema.parse(request.params);
    await deactivatePatient(ctxFrom(request), id);
    return reply.status(204).send();
  });
}
