import { Worker } from "bullmq";
import { GEOCODING_QUEUE, createRedisConnection, type GeocodeJob } from "../../lib/queue.js";
import { geocodePatient } from "./geocoding.service.js";

/**
 * In-Process-Worker für Geocoding-Jobs. Für die MVP-Phase co-lokal zum Backend;
 * in Produktion wandert das laut CLAUDE.md in einen netz-isolierten Dienst.
 * userId = null -> System-Aktion im Audit-Log.
 */
export function startGeocodingWorker(): Worker<GeocodeJob> {
  const worker = new Worker<GeocodeJob>(
    GEOCODING_QUEUE,
    async (job) => {
      await geocodePatient({ organizationId: job.data.organizationId, userId: null }, job.data.patientId);
    },
    { connection: createRedisConnection(), concurrency: 5 },
  );

  worker.on("failed", (job, err) => {
    console.warn(`[geocoding] Job ${job?.id} fehlgeschlagen:`, err.message);
  });

  return worker;
}
