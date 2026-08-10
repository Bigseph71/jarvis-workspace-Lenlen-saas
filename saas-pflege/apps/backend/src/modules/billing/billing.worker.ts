import { Queue, Worker } from "bullmq";
import { BILLING_QUEUE, createRedisConnection, type BillingSweepJob } from "../../lib/queue.js";
import { env } from "../../config/env.js";
import { suspendExpiredGracePeriods } from "./grace.js";
import { suspendExpiredTrials } from "./trial.js";

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
      // Zwei Fristen im selben Lauf: sie treffen disjunkte Mengen (PAST_DUE
      // gegen TRIAL) und teilen sich denselben Takt. Ein zweiter Scheduler
      // brächte nur einen weiteren beweglichen Teil.
      const graceCount = await suspendExpiredGracePeriods();
      if (graceCount > 0) {
        console.warn(`[billing] Karenzzeit abgelaufen: ${graceCount} Tenant(s) suspendiert`);
      }

      const trialCount = await suspendExpiredTrials();
      if (trialCount > 0) {
        console.warn(`[billing] Testphase abgelaufen: ${trialCount} Tenant(s) suspendiert`);
      }

      return { suspended: graceCount + trialCount, grace: graceCount, trial: trialCount };
    },
    { connection: createRedisConnection(), concurrency: 1 },
  );

  worker.on("failed", (job, err) => {
    console.warn(`[billing] Job ${job?.id} fehlgeschlagen:`, err.message);
  });

  return worker;
}
