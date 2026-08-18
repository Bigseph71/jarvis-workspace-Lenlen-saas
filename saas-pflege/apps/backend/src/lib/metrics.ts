import { createHash, timingSafeEqual } from "node:crypto";
import { collectDefaultMetrics, Counter, Histogram, Registry } from "prom-client";
import type { FastifyInstance, FastifyRequest } from "fastify";

/**
 * Eigene Prometheus-Registry (nicht die globale Default-Registry). So bleiben
 * die Metriken dieses Prozesses isoliert und in Tests kollisionsfrei.
 */
export const registry = new Registry();

// Alle Zeitreihen tragen den Service-Namen – im Grafana-Dashboard lassen sich
// so mehrere Dienste (backend, vrptw-worker, ...) sauber auseinanderhalten.
registry.setDefaultLabels({ service: "backend" });

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

// collectDefaultMetrics registriert seine Zeitreihen an der Registry und legt
// Timer an; ein zweiter Aufruf auf derselben Registry wirft. Deshalb genau
// einmal je Prozess, auch wenn mehrere Instanzen registriert werden (Tests).
let defaultMetricsStarted = false;
function startDefaultMetrics(): void {
  if (defaultMetricsStarted) return;
  collectDefaultMetrics({ register: registry });
  defaultMetricsStarted = true;
}

/** Token aus `Authorization: Bearer <token>`; undefined, wenn nicht vorhanden. */
export function bearerToken(header: string | undefined): string | undefined {
  if (!header) return undefined;
  const match = /^Bearer (.+)$/.exec(header.trim());
  return match?.[1];
}

/**
 * Vergleich in konstanter Zeit. Beide Seiten werden gehasht, damit
 * timingSafeEqual gleich lange Puffer bekommt und die Länge des erwarteten
 * Tokens nicht über die Antwortzeit durchsickert.
 */
export function tokenMatches(expected: string, provided: string | undefined): boolean {
  if (provided === undefined) return false;
  const a = createHash("sha256").update(expected).digest();
  const b = createHash("sha256").update(provided).digest();
  return timingSafeEqual(a, b);
}

export interface MetricsOptions {
  /**
   * Scrape-Token. Ohne Token entsteht kein `/metrics`-Endpunkt.
   *
   * Der Vorgabezustand ist bewusst "gar nicht vorhanden" statt "offen": der
   * Endpunkt war auf Railway monatelang ohne jede Prüfung aus dem Internet
   * erreichbar. Der Kommentar im Code nahm an, er liege netzintern – das gilt
   * für docker-compose, nicht für einen Dienst mit öffentlicher Domain. Wird
   * eines Tages ein Prometheus danebengestellt, bekommt er ein Token; einen
   * ungeschützten Zustand gibt es dann nicht mehr.
   */
  token?: string | undefined;
}

/**
 * Registriert – sofern ein Scrape-Token gesetzt ist – den Prometheus-Endpunkt
 * `/metrics` und einen Hook, der jede Antwort in die Histogramm-/Counter-
 * Metriken einträgt.
 *
 * Als Route-Label wird das Fastify-Routen-Muster (z.B. `/patients/:id`) statt
 * der konkreten URL verwendet – das hält die Kardinalität der Zeitreihen niedrig.
 * Anfragen ohne gematchte Route (404) werden zu `unknown` zusammengefasst.
 *
 * Ohne Token wird nichts angelegt und nichts gesammelt: keine Route, kein
 * Hook, keine Standardmetriken. Was niemand abholt, muss auch nicht erhoben
 * werden – und was es nicht gibt, kann nicht ausgelesen werden.
 */
export function registerMetrics(app: FastifyInstance, options: MetricsOptions = {}): void {
  const token = options.token;
  if (!token) {
    app.log.info("METRICS_TOKEN nicht gesetzt – /metrics ist deaktiviert");
    return;
  }

  startDefaultMetrics();

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

  app.get("/metrics", async (request: FastifyRequest, reply) => {
    if (!tokenMatches(token, bearerToken(request.headers.authorization))) {
      return reply.status(401).send({ error: "Unauthorized" });
    }
    reply.header("Content-Type", registry.contentType);
    return registry.metrics();
  });
}
