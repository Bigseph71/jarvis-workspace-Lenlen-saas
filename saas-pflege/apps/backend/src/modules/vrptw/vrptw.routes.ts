import { z } from "zod";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { UserRole } from "@len-len/database";
import { authenticate } from "../../plugins/authenticate.js";
import { requireRole } from "../../plugins/rbac.js";
import type { TenantContext } from "../../lib/context.js";
import { AppError } from "../../lib/errors.js";
import { enqueueVrptw } from "../../lib/queue.js";
import { getRoute } from "./vrptw.service.js";

const idParamSchema = z.object({ id: z.string().uuid() });

// Planung/Optimierung: Koordinator (Admins als Obermenge).
const canOptimize = requireRole(
  UserRole.SUPER_ADMIN,
  UserRole.STRUKTUR_ADMIN,
  UserRole.KOORDINATOR,
);

function ctxFrom(req: FastifyRequest): TenantContext {
  return { organizationId: req.user!.organizationId, userId: req.user!.userId };
}

export async function vrptwRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", authenticate);

  /**
   * Stößt die asynchrone VRPTW-Optimierung einer Tour an (nie blockierend).
   * Antwort 202 + Job-ID; das Ergebnis wird per GET /routes/:id gepollt.
   * Existenz + Tenant-Zugehörigkeit der Route werden vorab geprüft, damit ein
   * falscher Aufruf sofort 404 liefert statt still im Worker zu scheitern.
   */
  app.post("/routes/:id/optimize", { preHandler: [canOptimize] }, async (request, reply) => {
    const { id } = idParamSchema.parse(request.params);
    const ctx = ctxFrom(request);

    const route = await getRoute(ctx, id); // wirft 404, wenn nicht vorhanden

    try {
      const jobId = await enqueueVrptw({
        organizationId: ctx.organizationId,
        routeId: route.id,
        caregiverId: route.caregiverId ?? "",
        date: route.date,
      });
      return reply.status(202).send({ routeId: route.id, jobId, status: "queued" });
    } catch (err) {
      request.log.warn({ err }, "[vrptw] enqueue fehlgeschlagen");
      throw new AppError(503, "Optimierung derzeit nicht verfügbar (Queue nicht erreichbar).", "QueueUnavailable");
    }
  });

  // Aktueller Tour-Status (Polling des Optimierungsergebnisses).
  app.get("/routes/:id", { preHandler: [canOptimize] }, async (request) => {
    const { id } = idParamSchema.parse(request.params);
    return getRoute(ctxFrom(request), id);
  });
}
