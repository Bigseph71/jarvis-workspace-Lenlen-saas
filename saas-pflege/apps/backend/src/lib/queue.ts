import { Queue, QueueEvents, type ConnectionOptions } from "bullmq";
import { Redis as IORedis } from "ioredis";
import { env } from "../config/env.js";

export const GEOCODING_QUEUE = "geocoding";
export const VRPTW_QUEUE = "vrptw-optimization";
export const BILLING_QUEUE = "billing";
export const CLUSTERING_QUEUE = "clustering-daily";

export interface GeocodeJob {
  organizationId: string;
  patientId: string;
}

/**
 * Periodischer Karenzzeit-Lauf (Regel 8). Ohne Nutzlast: der Job wird vom
 * Scheduler ausgelöst und arbeitet über alle Tenants (siehe billing.worker.ts).
 */
export type BillingSweepJob = Record<string, never>;

/** Nutzlast eines VRPTW-Optimierungsjobs (eine Tour = eine Fachkraft + Tag). */
export interface VrptwJob {
  organizationId: string;
  routeId: string;
  caregiverId: string;
  date: string;
}

/**
 * Nutzlast einer täglichen Gebietsaufteilung (Clustering).
 *
 * Trägt die Parameter mit, statt sie im Worker erneut zu ermitteln: der Job
 * muss dasselbe rechnen wie der synchrone Pfad, auch wenn zwischen Einreihen
 * und Ausführung jemand die Voreinstellungen ändert.
 */
export interface ClusteringJob {
  organizationId: string;
  userId: string | null;
  date: string;
  algorithm: "dbscan" | "kmeans";
  k?: number;
  epsilonKm?: number;
  minPoints?: number;
}

/**
 * Job-ID einer Gebietsaufteilung: ein Tenant und ein Tag ergeben genau einen
 * Job. Verhindert, dass sich bei mehrfachem Klicken Jobs stapeln, und macht die
 * ID für den WebSocket-Stream vorhersagbar (kein Umweg über eine Antwort).
 */
export function clusteringJobId(organizationId: string, date: string): string {
  return `${organizationId}:${date}`;
}

/**
 * Neue Redis-Verbindung als BullMQ-ConnectionOptions.
 * Der Cast überbrückt das doppelte ioredis-Typenpaket (App vs. BullMQ) – zur
 * Laufzeit ist es dieselbe ioredis-Instanz. BullMQ verlangt maxRetriesPerRequest: null.
 */
export function createRedisConnection(): ConnectionOptions {
  return new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null }) as unknown as ConnectionOptions;
}

/**
 * Producer-Verbindung (Enqueue). `enableOfflineQueue: false` lässt Befehle
 * SOFORT fehlschlagen, wenn Redis nicht erreichbar ist, statt sie unbegrenzt zu
 * puffern. So bleibt das Einreihen wirklich best-effort und blockiert den
 * auslösenden Request nie (siehe enqueueGeocode). Die Worker-Verbindung
 * (createRedisConnection) bleibt davon unberührt.
 */
function createQueueConnection(): ConnectionOptions {
  return new IORedis(env.REDIS_URL, {
    maxRetriesPerRequest: null,
    enableOfflineQueue: false,
  }) as unknown as ConnectionOptions;
}

let queueConnection: ConnectionOptions | undefined;
let geocodingQueue: Queue<GeocodeJob> | undefined;
let vrptwQueue: Queue<VrptwJob> | undefined;
let clusteringQueue: Queue<ClusteringJob> | undefined;

/** Gemeinsame Producer-Verbindung (lazy, einmalig für alle Enqueue-Queues). */
function getQueueConnection(): ConnectionOptions {
  if (!queueConnection) queueConnection = createQueueConnection();
  return queueConnection;
}

function getGeocodingQueue(): Queue<GeocodeJob> {
  if (!geocodingQueue) {
    geocodingQueue = new Queue<GeocodeJob>(GEOCODING_QUEUE, { connection: getQueueConnection() });
  }
  return geocodingQueue;
}

function getVrptwQueue(): Queue<VrptwJob> {
  if (!vrptwQueue) {
    vrptwQueue = new Queue<VrptwJob>(VRPTW_QUEUE, { connection: getQueueConnection() });
  }
  return vrptwQueue;
}

function getClusteringQueue(): Queue<ClusteringJob> {
  if (!clusteringQueue) {
    clusteringQueue = new Queue<ClusteringJob>(CLUSTERING_QUEUE, { connection: getQueueConnection() });
  }
  return clusteringQueue;
}

let vrptwQueueEvents: QueueEvents | undefined;
let clusteringQueueEvents: QueueEvents | undefined;

/**
 * Gemeinsamer QueueEvents-Stream der VRPTW-Queue (Redis-basiert, daher auch
 * prozessübergreifend nutzbar, wenn der Worker später in einen isolierten
 * Microservice wandert). Braucht eine EIGENE (blockierende) Verbindung.
 * Konsumenten (WebSocket) filtern selbst nach jobId.
 */
export function getVrptwQueueEvents(): QueueEvents {
  if (!vrptwQueueEvents) {
    vrptwQueueEvents = new QueueEvents(VRPTW_QUEUE, { connection: createRedisConnection() });
  }
  return vrptwQueueEvents;
}

/** Ereignisstrom der Clustering-Queue (siehe getVrptwQueueEvents). */
export function getClusteringQueueEvents(): QueueEvents {
  if (!clusteringQueueEvents) {
    clusteringQueueEvents = new QueueEvents(CLUSTERING_QUEUE, { connection: createRedisConnection() });
  }
  return clusteringQueueEvents;
}

/** Auf unser Status-Vokabular gemappter Job-Zustand einer Tour. */
export type VrptwJobStatus = "pending" | "processing" | "done" | "failed" | "unknown";

function mapJobState(state: string): VrptwJobStatus {
  switch (state) {
    case "waiting":
    case "waiting-children":
    case "delayed":
    case "prioritized":
      return "pending";
    case "active":
      return "processing";
    case "completed":
      return "done";
    case "failed":
      return "failed";
    default:
      return "unknown";
  }
}

/**
 * Aktueller Queue-Zustand des Jobs einer Tour (jobId = routeId). Liefert
 * zusätzlich das Ergebnis (bei done) bzw. den Fehlergrund (bei failed), soweit
 * der Job noch nicht aus Redis entfernt wurde (removeOnComplete).
 */
export async function getVrptwJobStatus(
  routeId: string,
): Promise<{ status: VrptwJobStatus; result?: unknown; error?: string }> {
  const job = await getVrptwQueue().getJob(routeId);
  if (!job) return { status: "unknown" };
  const status = mapJobState(await job.getState());
  return {
    status,
    ...(status === "done" ? { result: job.returnvalue } : {}),
    ...(status === "failed" ? { error: job.failedReason } : {}),
  };
}

/** Lässt ein Promise nach `ms` rejecten (Sicherheitsnetz gegen Blockieren). */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error("enqueue timeout")), ms)),
  ]);
}

/**
 * Reiht einen Geocoding-Job ein. Best-effort: ist Redis nicht erreichbar,
 * scheitert NICHT der auslösende Request (Patient ist trotzdem angelegt; das
 * Geocoding kann später per /geocoding/process nachgeholt werden).
 */
export async function enqueueGeocode(job: GeocodeJob): Promise<void> {
  try {
    await withTimeout(
      getGeocodingQueue().add("geocode", job, {
        attempts: 3,
        backoff: { type: "exponential", delay: 2000 },
        removeOnComplete: true,
        removeOnFail: 100,
      }),
      2000,
    );
  } catch (err) {
    console.warn("[geocoding] enqueue fehlgeschlagen, übersprungen:", err);
  }
}

/**
 * Reiht einen VRPTW-Optimierungsjob ein und liefert die Job-ID zurück.
 * Anders als beim Geocoding wird ein Fehler NICHT verschluckt: der Koordinator
 * hat die Optimierung bewusst angestoßen und muss erfahren, wenn sie (z.B. bei
 * nicht erreichbarem Redis) gar nicht erst eingereiht werden konnte.
 * `jobId = routeId` verhindert, dass sich mehrere Jobs für dieselbe Tour stapeln
 * (removeOnComplete gibt die ID nach Abschluss für eine Neu-Optimierung frei).
 */
export async function enqueueVrptw(job: VrptwJob): Promise<string> {
  const added = await withTimeout(
    getVrptwQueue().add("optimize", job, {
      jobId: job.routeId,
      attempts: 2,
      backoff: { type: "exponential", delay: 3000 },
      removeOnComplete: true,
      removeOnFail: 100,
    }),
    2000,
  );
  return added.id ?? job.routeId;
}

/**
 * Reiht eine tägliche Gebietsaufteilung ein. Wie beim VRPTW wird ein Fehler
 * NICHT verschluckt: die Koordination hat den Lauf bewusst angestoßen.
 *
 * `removeOnComplete: 3600` statt `true` – das Ergebnis muss den Job überleben,
 * damit ein Client, der sich erst nach Abschluss verbindet, es noch abholen
 * kann. Bei der Optimierung liegt das Ergebnis in der Route, hier gibt es
 * keine Tabelle: verschwindet der Job, ist die Berechnung verloren.
 */
export async function enqueueClustering(job: ClusteringJob): Promise<string> {
  const id = clusteringJobId(job.organizationId, job.date);
  const added = await withTimeout(
    getClusteringQueue().add("cluster", job, {
      jobId: id,
      attempts: 2,
      backoff: { type: "exponential", delay: 3000 },
      removeOnComplete: { age: 3600, count: 100 },
      removeOnFail: 100,
    }),
    2000,
  );
  return added.id ?? id;
}

/** Queue-Zustand einer Gebietsaufteilung (jobId = organizationId:date). */
export async function getClusteringJobStatus(
  organizationId: string,
  date: string,
): Promise<{ status: VrptwJobStatus; result?: unknown; error?: string }> {
  const job = await getClusteringQueue().getJob(clusteringJobId(organizationId, date));
  if (!job) return { status: "unknown" };
  const status = mapJobState(await job.getState());
  return {
    status,
    ...(status === "done" ? { result: job.returnvalue } : {}),
    ...(status === "failed" ? { error: job.failedReason } : {}),
  };
}
