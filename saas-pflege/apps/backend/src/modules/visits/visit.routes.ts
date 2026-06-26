import { z } from "zod";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { UserRole } from "@len-len/database";
import { authenticate } from "../../plugins/authenticate.js";
import { requireRole } from "../../plugins/rbac.js";
import type { TenantContext } from "../../lib/context.js";
import {
  createVisitSchema,
  createEmergencyVisitSchema,
  rescheduleVisitSchema,
  assignCaregiverSchema,
  listVisitsQuerySchema,
  missingWeekQuerySchema,
  myVisitsQuerySchema,
} from "./visit.schemas.js";
import {
  createVisit,
  createEmergencyVisit,
  listVisits,
  getVisit,
  rescheduleVisit,
  assignCaregiver,
  checkIn,
  checkOut,
  cancelVisit,
  patientsMissingWeeklyVisit,
  myVisitsForDay,
} from "./visit.service.js";

const idParamSchema = z.object({ id: z.string().uuid() });

// Planung: Koordinator + Admin-Ebene.
const canPlan = requireRole(UserRole.SUPER_ADMIN, UserRole.STRUKTUR_ADMIN, UserRole.KOORDINATOR);
// Pointage: zusätzlich die Fachkraft selbst.
const canTrack = requireRole(
  UserRole.SUPER_ADMIN,
  UserRole.STRUKTUR_ADMIN,
  UserRole.KOORDINATOR,
  UserRole.FACHKRAFT,
);

function ctxFrom(req: FastifyRequest): TenantContext {
  return { organizationId: req.user!.organizationId, userId: req.user!.userId };
}

/** Fachkraft nur auf eigene Besuche; Planer ohne Einschränkung. */
function ownership(req: FastifyRequest): { enforceOwnerUserId?: string } {
  return req.user!.role === UserRole.FACHKRAFT ? { enforceOwnerUserId: req.user!.userId } : {};
}

export async function visitRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", authenticate);

  app.get("/visits", { preHandler: [canPlan] }, async (request) => {
    const query = listVisitsQuerySchema.parse(request.query);
    return listVisits(ctxFrom(request), query);
  });

  app.get("/visits/:id", { preHandler: [canPlan] }, async (request) => {
    const { id } = idParamSchema.parse(request.params);
    return getVisit(ctxFrom(request), id);
  });

  app.post("/visits", { preHandler: [canPlan] }, async (request, reply) => {
    const input = createVisitSchema.parse(request.body);
    const visit = await createVisit(ctxFrom(request), input);
    return reply.status(201).send(visit);
  });

  app.post("/visits/emergency", { preHandler: [canPlan] }, async (request, reply) => {
    const input = createEmergencyVisitSchema.parse(request.body);
    const visit = await createEmergencyVisit(ctxFrom(request), input);
    return reply.status(201).send(visit);
  });

  app.patch("/visits/:id/reschedule", { preHandler: [canPlan] }, async (request) => {
    const { id } = idParamSchema.parse(request.params);
    const input = rescheduleVisitSchema.parse(request.body);
    return rescheduleVisit(ctxFrom(request), id, input);
  });

  app.put("/visits/:id/caregiver", { preHandler: [canPlan] }, async (request) => {
    const { id } = idParamSchema.parse(request.params);
    const { caregiverId } = assignCaregiverSchema.parse(request.body);
    return assignCaregiver(ctxFrom(request), id, caregiverId);
  });

  app.post("/visits/:id/cancel", { preHandler: [canPlan] }, async (request) => {
    const { id } = idParamSchema.parse(request.params);
    return cancelVisit(ctxFrom(request), id);
  });

  // Pointage GPS (Fachkraft auf eigene Besuche, Planer auch).
  app.post("/visits/:id/check-in", { preHandler: [canTrack] }, async (request) => {
    const { id } = idParamSchema.parse(request.params);
    return checkIn(ctxFrom(request), id, ownership(request));
  });

  app.post("/visits/:id/check-out", { preHandler: [canTrack] }, async (request) => {
    const { id } = idParamSchema.parse(request.params);
    return checkOut(ctxFrom(request), id, ownership(request));
  });

  // Regel métier 3: Wochen-Alerte für fehlende Besuche.
  app.get("/visits/alerts/missing-week", { preHandler: [canPlan] }, async (request) => {
    const { weekOf } = missingWeekQuerySchema.parse(request.query);
    return patientsMissingWeeklyVisit(ctxFrom(request), weekOf ?? new Date());
  });

  // Tagesroute der eingeloggten Fachkraft.
  app.get(
    "/visits/mine",
    { preHandler: [requireRole(UserRole.FACHKRAFT)] },
    async (request) => {
      const { date } = myVisitsQuerySchema.parse(request.query);
      return myVisitsForDay(ctxFrom(request), date ?? new Date());
    },
  );
}
