import { Worker } from "bullmq";
import { CLUSTERING_QUEUE, createRedisConnection, type ClusteringJob } from "../../lib/queue.js";
import { computeDailyClustering } from "./clustering.service.js";

/**
 * Worker der täglichen Gebietsaufteilung.
 *
 * Ruft DIESELBE Funktion auf wie der synchrone Pfad. Eine zweite, „für den
 * Worker optimierte“ Implementierung wäre der sichere Weg dahin, dass große
 * Strukturen ein anderes Ergebnis bekommen als kleine – und niemand würde es
 * bemerken, weil beide Wege nie am selben Datensatz verglichen werden.
 *
 * `userId` stammt aus dem Job und nicht aus dem Kontext des Workers: der
 * Audit-Eintrag muss die Person nennen, die den Lauf ausgelöst hat, nicht das
 * System. Ein Lauf ohne Urheber wäre im Zugriffsprotokoll wertlos.
 *
 * concurrency: 2 – die Rechnung ist CPU-gebunden (O(n²) Distanzen) und teilt
 * sich den Event-Loop mit dem Backend.
 */
export function startClusteringWorker(): Worker<ClusteringJob> {
  const worker = new Worker<ClusteringJob>(
    CLUSTERING_QUEUE,
    async (job) =>
      computeDailyClustering(
        { organizationId: job.data.organizationId, userId: job.data.userId },
        {
          date: job.data.date,
          algorithm: job.data.algorithm,
          k: job.data.k,
          epsilonKm: job.data.epsilonKm,
          minPoints: job.data.minPoints,
        },
      ),
    { connection: createRedisConnection(), concurrency: 2 },
  );

  worker.on("failed", (job, err) => {
    console.warn(`[clustering] Job ${job?.id} fehlgeschlagen:`, err.message);
  });

  return worker;
}
