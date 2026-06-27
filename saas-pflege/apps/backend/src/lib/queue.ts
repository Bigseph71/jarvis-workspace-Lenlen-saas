import { Queue, type ConnectionOptions } from "bullmq";
import { Redis as IORedis } from "ioredis";
import { env } from "../config/env.js";

export const GEOCODING_QUEUE = "geocoding";

export interface GeocodeJob {
  organizationId: string;
  patientId: string;
}

/**
 * Neue Redis-Verbindung als BullMQ-ConnectionOptions.
 * Der Cast überbrückt das doppelte ioredis-Typenpaket (App vs. BullMQ) – zur
 * Laufzeit ist es dieselbe ioredis-Instanz. BullMQ verlangt maxRetriesPerRequest: null.
 */
export function createRedisConnection(): ConnectionOptions {
  return new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null }) as unknown as ConnectionOptions;
}

let queueConnection: ConnectionOptions | undefined;
let geocodingQueue: Queue<GeocodeJob> | undefined;

function getGeocodingQueue(): Queue<GeocodeJob> {
  if (!geocodingQueue) {
    queueConnection = createRedisConnection();
    geocodingQueue = new Queue<GeocodeJob>(GEOCODING_QUEUE, { connection: queueConnection });
  }
  return geocodingQueue;
}

/**
 * Reiht einen Geocoding-Job ein. Best-effort: ist Redis nicht erreichbar,
 * scheitert NICHT der auslösende Request (Patient ist trotzdem angelegt; das
 * Geocoding kann später per /geocoding/process nachgeholt werden).
 */
export async function enqueueGeocode(job: GeocodeJob): Promise<void> {
  try {
    await getGeocodingQueue().add("geocode", job, {
      attempts: 3,
      backoff: { type: "exponential", delay: 2000 },
      removeOnComplete: true,
      removeOnFail: 100,
    });
  } catch (err) {
    console.warn("[geocoding] enqueue fehlgeschlagen, übersprungen:", err);
  }
}
