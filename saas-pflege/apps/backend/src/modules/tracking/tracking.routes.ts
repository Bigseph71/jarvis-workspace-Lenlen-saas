import type { FastifyInstance, FastifyRequest } from "fastify";
import { UserRole } from "@len-len/database";
import { authenticate } from "../../plugins/authenticate.js";
import { requireRole } from "../../plugins/rbac.js";
import type { TenantContext } from "../../lib/context.js";
import { postPositionSchema } from "./tracking.schemas.js";
import { recordPosition, livePositions } from "./tracking.service.js";

// Nur die Fachkraft meldet ihre Position; die caregiverId wird serverseitig
// aus dem Konto abgeleitet (kein Client-Spoofing).
const canTrack = requireRole(UserRole.FACHKRAFT);
// Live-Karte: Koordination + Admins (organisationsweit).
const canViewLive = requireRole(
  UserRole.SUPER_ADMIN,
  UserRole.STRUKTUR_ADMIN,
  UserRole.KOORDINATOR,
);

function ctxFrom(req: FastifyRequest): TenantContext {
  return { organizationId: req.user!.organizationId, userId: req.user!.userId };
}

export async function trackingRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", authenticate);

  // Position der Fachkraft während eines aktiven Besuchs (alle 30 s).
  app.post("/tracking/position", { preHandler: [canTrack] }, async (request, reply) => {
    const input = postPositionSchema.parse(request.body);
    const result = await recordPosition(ctxFrom(request), input);
    return reply.status(201).send(result);
  });

  // Aktuelle Positionen aller Fachkräfte der Organisation (Snapshot).
  app.get("/tracking/live", { preHandler: [canViewLive] }, async (request) => {
    return { positions: await livePositions(ctxFrom(request)) };
  });
}
