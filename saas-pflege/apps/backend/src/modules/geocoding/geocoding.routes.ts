import { z } from "zod";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { UserRole } from "@len-len/database";
import { authenticate } from "../../plugins/authenticate.js";
import { requireRole } from "../../plugins/rbac.js";
import type { TenantContext } from "../../lib/context.js";
import { geocodePatient, processPendingForOrg } from "./geocoding.service.js";

const idParamSchema = z.object({ id: z.string().uuid() });
const processQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

const canManage = requireRole(UserRole.SUPER_ADMIN, UserRole.STRUKTUR_ADMIN, UserRole.KOORDINATOR);
const canAdmin = requireRole(UserRole.SUPER_ADMIN, UserRole.STRUKTUR_ADMIN);

function ctxFrom(req: FastifyRequest): TenantContext {
  return { organizationId: req.user!.organizationId, userId: req.user!.userId };
}

export async function geocodingRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", authenticate);

  // Einen Patienten (erneut) geokodieren.
  app.post("/patients/:id/geocode", { preHandler: [canManage] }, async (request) => {
    const { id } = idParamSchema.parse(request.params);
    return geocodePatient(ctxFrom(request), id);
  });

  // Stapelverarbeitung aller PENDING-Patienten des Tenants.
  app.post("/geocoding/process", { preHandler: [canAdmin] }, async (request) => {
    const { limit } = processQuerySchema.parse(request.query);
    return processPendingForOrg(ctxFrom(request), limit);
  });
}
