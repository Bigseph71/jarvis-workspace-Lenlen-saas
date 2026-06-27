import { Worker, Queue } from "bullmq";
import IORedis from "ioredis";
import pino from "pino";

const log = pino({ name: "vrptw-worker" });

const connection = new IORedis(process.env.REDIS_URL ?? "redis://localhost:6379", {
  maxRetriesPerRequest: null,
});

export const VRPTW_QUEUE = "vrptw-optimization";
const TIMEOUT_MS = Number(process.env.VRPTW_TIMEOUT_MS ?? 30000);

// Queue zum Einreihen von Optimierungs-Jobs (vom Backend genutzt).
export const vrptwQueue = new Queue(VRPTW_QUEUE, { connection });

interface VrptwJobData {
  organizationId: string;
  routeId: string;
  date: string;
}

// TODO: echte VRPTW-Lösung (Time Windows, Arbeitszeiten, Leasing-Regel,
// Lastausgleich). Bei Timeout Teil-Lösung zurückgeben.
const worker = new Worker<VrptwJobData>(
  VRPTW_QUEUE,
  async (job) => {
    log.info({ jobId: job.id, ...job.data }, "VRPTW-Optimierung gestartet");
    const deadline = Date.now() + TIMEOUT_MS;
    // Regel métier 7 (TODO): Vor der Optimierung prüfen, dass kein Patient der
    // Tour geocodingStatus = INVALID hat. Sonst Job ablehnen / Patient melden,
    // da ohne gültige Koordinaten keine Routenoptimierung möglich ist.
    // Platzhalter-Ergebnis
    return {
      optimized: true,
      partial: Date.now() > deadline,
      vrptwScore: 0,
      totalKm: 0,
    };
  },
  { connection, concurrency: 4 },
);

worker.on("completed", (job) => log.info({ jobId: job.id }, "Job abgeschlossen"));
worker.on("failed", (job, err) => log.error({ jobId: job?.id, err }, "Job fehlgeschlagen"));

log.info("VRPTW-Worker bereit");
