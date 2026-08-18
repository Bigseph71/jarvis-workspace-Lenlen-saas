import type { FastifyInstance, FastifyRequest } from "fastify";
import { authenticate } from "../../plugins/authenticate.js";
import { requireRole } from "../../plugins/rbac.js";
import { PLANNING_ROLES } from "../../lib/roles.js";
import { AppError } from "../../lib/errors.js";
import { enqueueClustering } from "../../lib/queue.js";
import type { TenantContext } from "../../lib/context.js";
import { dailyClusteringSchema } from "./clustering.schemas.js";
import {
  SYNC_PATIENT_THRESHOLD,
  assertPlanAllowsClustering,
  computeDailyClustering,
  countDailyPatients,
} from "./clustering.service.js";

/** Planung: Koordinator, Admins als Obermenge. Identisch zum VRPTW-Modul. */
// Dieselbe Liste wie der WebSocket-Stream (lib/roles.ts).
const canPlan = requireRole(...PLANNING_ROLES);

function ctxFrom(req: FastifyRequest): TenantContext {
  return { organizationId: req.user!.organizationId, userId: req.user!.userId };
}

export async function clusteringRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", authenticate);

  /**
   * Tägliche Gebietsaufteilung.
   *
   * Zwei Antwortformen, je nach Größe des Tages:
   *   200 + Ergebnis   bis SYNC_PATIENT_THRESHOLD Patienten
   *   202 + jobId      darüber; das Ergebnis kommt über den WebSocket-Stream
   *
   * Die Organisation stammt ausschließlich aus dem JWT (siehe Schema).
   *
   * Der Plan-Check läuft VOR der Zählung: eine Basic-Struktur soll 403 sehen
   * und nicht erst eine Warteschlange, aus der nie ein Ergebnis kommt.
   */
  app.post("/clustering/daily", { preHandler: [canPlan] }, async (request, reply) => {
    const input = dailyClusteringSchema.parse(request.body);
    const ctx = ctxFrom(request);

    // Vor der Zählung, damit eine Basic-Struktur 403 sieht statt einer
    // Warteschlange, aus der nie ein Ergebnis kommt. Der synchrone Pfad prüft
    // es erneut im Service – doppelt, aber die zweite Prüfung deckt den
    // Worker-Pfad ab, der nicht durch diese Route läuft.
    await assertPlanAllowsClustering(ctx.organizationId);

    const patientCount = await countDailyPatients(ctx, input.date);

    if (patientCount <= SYNC_PATIENT_THRESHOLD) {
      return computeDailyClustering(ctx, input);
    }

    try {
      const jobId = await enqueueClustering({
        organizationId: ctx.organizationId,
        userId: ctx.userId,
        date: input.date,
        algorithm: input.algorithm,
        k: input.k,
        epsilonKm: input.epsilonKm,
        minPoints: input.minPoints,
      });
      return reply.status(202).send({
        jobId,
        status: "queued",
        date: input.date,
        patientCount,
      });
    } catch (err) {
      request.log.warn({ err }, "[clustering] enqueue fehlgeschlagen");
      throw new AppError(
        503,
        "Gebietsaufteilung derzeit nicht verfügbar (Queue nicht erreichbar).",
        "QueueUnavailable",
      );
    }
  });
}
