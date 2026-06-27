import { Queue } from "bullmq";
import { Redis as IORedis } from "ioredis";
import { env } from "../config/env.js";

export const GEOCODING_QUEUE = "geocoding";

export interface GeocodeJob {
  organizationId: string;
  patientId: string;
}

/** Neue Redis-Verbindung (BullMQ verlangt maxRetriesPerRequest: null). */
export function createRedisConnection(): IORedis {
  return new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null });
}

let queueConnection: IORedis | undefined;
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
