import { Worker } from "bullmq";
import { VRPTW_QUEUE, createRedisConnection, type VrptwJob } from "../../lib/queue.js";
import { optimizeRoute } from "./vrptw.service.js";

/**
 * In-Process-Worker für VRPTW-Optimierungsjobs. Für die V1-Phase co-lokal zum
 * Backend; laut CLAUDE.md wandert die Optimierung später in einen netz-isolierten
 * Microservice (BullMQ-Vertrag bleibt identisch).
 *
 * concurrency: 2 – die Optimierung ist CPU-gebunden; wenige parallele Jobs
 * halten den Event-Loop des Backends frei. userId = null -> System-Aktion.
 */
export function startVrptwWorker(): Worker<VrptwJob> {
  const worker = new Worker<VrptwJob>(
    VRPTW_QUEUE,
    async (job) => {
      return optimizeRoute(
        { organizationId: job.data.organizationId, userId: null },
        job.data.routeId,
      );
    },
    { connection: createRedisConnection(), concurrency: 2 },
  );

  worker.on("failed", (job, err) => {
    console.warn(`[vrptw] Job ${job?.id} fehlgeschlagen:`, err.message);
  });

  return worker;
}
