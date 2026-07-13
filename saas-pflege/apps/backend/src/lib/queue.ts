import { Queue, QueueEvents, type ConnectionOptions } from "bullmq";
import { Redis as IORedis } from "ioredis";
import { env } from "../config/env.js";

export const GEOCODING_QUEUE = "geocoding";
export const VRPTW_QUEUE = "vrptw-optimization";

export interface GeocodeJob {
  organizationId: string;
  patientId: string;
}

/** Nutzlast eines VRPTW-Optimierungsjobs (eine Tour = eine Fachkraft + Tag). */
export interface VrptwJob {
  organizationId: string;
  routeId: string;
  caregiverId: string;
  date: string;
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

let vrptwQueueEvents: QueueEvents | undefined;

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
