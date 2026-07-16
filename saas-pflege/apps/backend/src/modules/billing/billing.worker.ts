import { Queue, Worker } from "bullmq";
import { BILLING_QUEUE, createRedisConnection, type BillingSweepJob } from "../../lib/queue.js";
import { env } from "../../config/env.js";
import { suspendExpiredGracePeriods } from "./grace.js";

const SWEEP_JOB = "grace-sweep";
// Feste ID: BullMQ ersetzt den Scheduler bei jedem Start, statt Wiederholungen
// über Neustarts hinweg zu stapeln.
const SWEEP_SCHEDULER_ID = "billing-grace-sweep";

/**
 * Periodischer Suspendierungs-Lauf (Regel 8). Als BullMQ-Repeatable statt
 * setInterval, damit bei mehreren Backend-Instanzen nur EINE Instanz je
 * Intervall den Lauf ausführt (Redis serialisiert den Scheduler) – sonst
 * würden alle Instanzen dieselben Tenants gleichzeitig suspendieren.
 */
export function startBillingWorker(): Worker<BillingSweepJob> {
  const queue = new Queue<BillingSweepJob>(BILLING_QUEUE, { connection: createRedisConnection() });

  void queue.upsertJobScheduler(
    SWEEP_SCHEDULER_ID,
    { every: env.BILLING_GRACE_CHECK_INTERVAL_MS },
    { name: SWEEP_JOB, opts: { removeOnComplete: true, removeOnFail: 50 } },
  );

  const worker = new Worker<BillingSweepJob>(
    BILLING_QUEUE,
    async () => {
      const count = await suspendExpiredGracePeriods();
      if (count > 0) {
        console.warn(`[billing] Karenzzeit abgelaufen: ${count} Tenant(s) suspendiert`);
      }
      return { suspended: count };
    },
    { connection: createRedisConnection(), concurrency: 1 },
  );

  worker.on("failed", (job, err) => {
    console.warn(`[billing] Job ${job?.id} fehlgeschlagen:`, err.message);
  });

  return worker;
}
