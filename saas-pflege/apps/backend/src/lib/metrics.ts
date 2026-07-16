import { collectDefaultMetrics, Counter, Histogram, Registry } from "prom-client";
import type { FastifyInstance } from "fastify";

/**
 * Eigene Prometheus-Registry (nicht die globale Default-Registry). So bleiben
 * die Metriken dieses Prozesses isoliert und in Tests kollisionsfrei.
 */
export const registry = new Registry();

// Alle Zeitreihen tragen den Service-Namen – im Grafana-Dashboard lassen sich
// so mehrere Dienste (backend, vrptw-worker, ...) sauber auseinanderhalten.
registry.setDefaultLabels({ service: "backend" });

// Node-/Prozess-Standardmetriken (Event-Loop-Lag, Heap, GC, CPU ...).
collectDefaultMetrics({ register: registry });

/** Anzahl abgeschlossener HTTP-Anfragen, aufgeschlüsselt nach Route/Methode/Status. */
export const httpRequestsTotal = new Counter({
  name: "http_requests_total",
  help: "Gesamtzahl der HTTP-Anfragen",
  labelNames: ["method", "route", "status_code"] as const,
  registers: [registry],
});

/** Antwortzeit-Verteilung in Sekunden (für Latenz-Perzentile / SLOs). */
export const httpRequestDurationSeconds = new Histogram({
  name: "http_request_duration_seconds",
  help: "Dauer der HTTP-Anfragen in Sekunden",
  labelNames: ["method", "route", "status_code"] as const,
  // Buckets von 5 ms bis 5 s – deckt schnelle CRUD-Antworten bis hin zu
  // langsameren aggregierten Abfragen ab.
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
  registers: [registry],
});

/**
 * Registriert den Prometheus-Endpunkt `/metrics` und einen Hook, der jede
 * Antwort in die Histogramm-/Counter-Metriken einträgt.
 *
 * Als Route-Label wird das Fastify-Routen-Muster (z.B. `/patients/:id`) statt
 * der konkreten URL verwendet – das hält die Kardinalität der Zeitreihen niedrig.
 * Anfragen ohne gematchte Route (404) werden zu `unknown` zusammengefasst.
 */
export function registerMetrics(app: FastifyInstance): void {
  app.addHook("onResponse", async (request, reply) => {
    const route = request.routeOptions?.url ?? "unknown";
    // Der /metrics-Scrape selbst soll die Metriken nicht verfälschen.
    if (route === "/metrics") return;

    const labels = {
      method: request.method,
      route,
      status_code: String(reply.statusCode),
    };
    httpRequestsTotal.inc(labels);
    // Fastify misst die Bearbeitungszeit bereits (Millisekunden) -> in Sekunden.
    httpRequestDurationSeconds.observe(labels, reply.elapsedTime / 1000);
  });

  // Kein Auth-Schutz: Der Endpunkt ist nur netzintern erreichbar (Prometheus
  // scrape-Target), nicht öffentlich exponiert (siehe Architektur-Regeln).
  app.get("/metrics", async (_request, reply) => {
    reply.header("Content-Type", registry.contentType);
    return registry.metrics();
  });
}
