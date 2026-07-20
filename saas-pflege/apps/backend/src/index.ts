// Lädt apps/backend/.env in process.env, BEVOR config/env.ts validiert wird
// (tsx/node laden .env nicht automatisch). Überschreibt keine bereits gesetzten
// Variablen – in Docker gewinnt weiterhin die per env_file/environment gesetzte
// Konfiguration.
import "dotenv/config";
import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import websocket from "@fastify/websocket";
import { ZodError } from "zod";
import { Prisma } from "@len-len/database";
import { env } from "./config/env.js";
import { AppError } from "./lib/errors.js";
import { runHealthCheck } from "./lib/health.js";
import { registerMetrics } from "./lib/metrics.js";
import { authRoutes } from "./modules/auth/auth.routes.js";
import { patientRoutes } from "./modules/patients/patient.routes.js";
import { caregiverRoutes } from "./modules/caregivers/caregiver.routes.js";
import { visitRoutes } from "./modules/visits/visit.routes.js";
import { geocodingRoutes } from "./modules/geocoding/geocoding.routes.js";
import { startGeocodingWorker } from "./modules/geocoding/geocoding.worker.js";
import { billingRoutes } from "./modules/billing/billing.routes.js";
import { billingWebhookRoutes } from "./modules/billing/webhook.routes.js";
import { startBillingWorker } from "./modules/billing/billing.worker.js";
import { chatRoutes } from "./modules/chat/chat.routes.js";
import { vehicleRoutes } from "./modules/vehicles/vehicle.routes.js";
import { vrptwRoutes } from "./modules/vrptw/vrptw.routes.js";
import { vrptwWsRoutes } from "./modules/vrptw/vrptw.ws.js";
import { startVrptwWorker } from "./modules/vrptw/vrptw.worker.js";
import { trackingRoutes } from "./modules/tracking/tracking.routes.js";
import { trackingWsRoutes } from "./modules/tracking/tracking.ws.js";

const isProduction = env.NODE_ENV === "production";

const app = Fastify({
  logger: {
    level: isProduction ? "info" : "debug",
    // Feste Basis-Felder auf jeder Logzeile (nützlich für die zentrale
    // Aggregation über mehrere Dienste in Loki/Grafana).
    base: { service: "backend", env: env.NODE_ENV },
    // Sensible Felder niemals loggen.
    redact: ["req.headers.authorization", "*.password", "*.passwordHash", "*.refreshToken"],
    // Produktion: strukturiertes JSON auf stdout (Standard von Pino), damit der
    // Log-Aggregator es direkt parsen kann. Entwicklung: menschenlesbar via
    // pino-pretty (nur devDependency, in Prod nie geladen).
    ...(isProduction
      ? {}
      : {
          transport: {
            target: "pino-pretty",
            options: { translateTime: "SYS:standard", ignore: "pid,hostname" },
          },
        }),
  },
});

await app.register(helmet);
await app.register(cors, {
  // Erlaubter Origin = Web-Frontend (nicht die API-URL selbst).
  origin: [env.WEB_ORIGIN],
  credentials: true,
});
await app.register(rateLimit, {
  max: 100,
  timeWindow: "1 minute",
});
// WebSocket-Unterstützung (Echtzeit-Status VRPTW). Muss vor den WS-Routen stehen.
await app.register(websocket);

// Prometheus-Metriken (/metrics) + onResponse-Hook zur Erfassung jeder Anfrage.
registerMetrics(app);

// Zentraler Error-Handler: Zod -> 400, AppError -> Status, Prisma-Unique -> 409.
app.setErrorHandler((error, request, reply) => {
  if (error instanceof ZodError) {
    return reply.status(400).send({
      error: "ValidationError",
      details: error.flatten().fieldErrors,
    });
  }
  if (error instanceof AppError) {
    return reply.status(error.statusCode).send({ error: error.code, message: error.message });
  }
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
    return reply.status(409).send({ error: "Conflict", message: "Eintrag existiert bereits" });
  }
  request.log.error(error);
  const err = error as { statusCode?: number };
  return reply.status(err.statusCode ?? 500).send({ error: "InternalServerError" });
});

// Health-Check (für Docker / Monitoring). Prüft Postgres + Redis und antwortet
// mit 503, sobald eine Abhängigkeit ausgefallen ist – so kann der Orchestrator
// (Docker/K8s) den Container als "unhealthy" erkennen, statt einen 500-Fehler
// zu sehen.
app.get("/health", async (_request, reply) => {
  const report = await runHealthCheck();
  reply.status(report.status === "ok" ? 200 : 503);
  return report;
});

await app.register(authRoutes);
await app.register(patientRoutes);
await app.register(caregiverRoutes);
await app.register(visitRoutes);
await app.register(geocodingRoutes);
await app.register(billingRoutes);
await app.register(billingWebhookRoutes);
await app.register(chatRoutes);
await app.register(vehicleRoutes);
await app.register(vrptwRoutes);
await app.register(vrptwWsRoutes);
await app.register(trackingRoutes);
await app.register(trackingWsRoutes);

// Async Geocoding-Worker (in-process für MVP). In Test-Umgebung aus.
if (env.NODE_ENV !== "test") {
  try {
    startGeocodingWorker();
    app.log.info("Geocoding-Worker gestartet");
  } catch (err) {
    app.log.warn({ err }, "Geocoding-Worker konnte nicht gestartet werden");
  }
  try {
    startVrptwWorker();
    app.log.info("VRPTW-Worker gestartet");
  } catch (err) {
    app.log.warn({ err }, "VRPTW-Worker konnte nicht gestartet werden");
  }
  try {
    startBillingWorker();
    app.log.info(
      `Billing-Worker gestartet (Karenzzeit: ${env.BILLING_GRACE_PERIOD_DAYS} Tage)`,
    );
  } catch (err) {
    app.log.warn({ err }, "Billing-Worker konnte nicht gestartet werden");
  }
}

// Phase 1 (MVP) Backend abgeschlossen: Auth, CRUD, Besuche, Geocoding, Billing.

try {
  await app.listen({ port: env.BACKEND_PORT, host: "0.0.0.0" });
  app.log.info(`Backend läuft auf :${env.BACKEND_PORT}`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
