import { Redis as IORedis } from "ioredis";
import { env } from "../config/env.js";

/**
 * Zähler-Speicher der Rate-Limits.
 *
 * Ohne Redis zählt @fastify/rate-limit im Arbeitsspeicher – JE INSTANZ. Bei
 * mehreren Instanzen hat jede ihren eigenen Zähler, und die zugesicherten
 * 10 Anmeldeversuche pro Minute werden faktisch zu 10 mal Anzahl Instanzen.
 * Gemessen in Produktion: 13 Versuche hintereinander ohne ein einziges 429,
 * bei einem Zähler, der zwischen 6 und 9 hin und her sprang. Als
 * Brute-Force-Bremse war das Limit damit wirkungslos.
 *
 * Eigene Verbindung, nicht die der Queues: kurze Timeouts, damit ein hängendes
 * Redis nicht jede Anfrage aufhält. Fällt Redis aus, lässt der Zähler die
 * Anfragen durch (`skipOnError`, Vorgabe des Plugins) – dieselbe Abwägung wie
 * bei der Token-Sperrliste: eine Zusatzschicht darf die API nicht lahmlegen.
 */
export function createRateLimitRedis(): IORedis | undefined {
  // Tests laufen ohne Redis; der Speicher-Zähler reicht dort und hält die
  // Suite unabhängig von einem laufenden Dienst.
  if (env.NODE_ENV === "test") return undefined;

  const client = new IORedis(env.REDIS_URL, {
    // Vom Plugin empfohlen: schnell scheitern statt Anfragen zu stauen.
    connectTimeout: 500,
    maxRetriesPerRequest: 1,
    // Eigener Namensraum, damit die Zähler nicht mit BullMQ-Schlüsseln kollidieren.
    keyPrefix: "ratelimit:",
    // Wiederverbinden, aber gedeckelt: nach einer Störung soll der Zähler
    // zurückkommen, ohne in einer engen Schleife zu hämmern.
    retryStrategy: (times) => Math.min(times * 200, 2000),
  });
  // Ein Verbindungsfehler darf den Prozess nicht mit einem unbehandelten
  // 'error' beenden; das Plugin fängt den Ausfall selbst ab.
  client.on("error", () => undefined);
  return client;
}
