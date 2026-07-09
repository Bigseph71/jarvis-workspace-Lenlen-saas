import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import { ZodError } from "zod";
import { Prisma, prisma } from "@len-len/database";
import { env } from "./config/env.js";
import { AppError } from "./lib/errors.js";
import { authRoutes } from "./modules/auth/auth.routes.js";
import { patientRoutes } from "./modules/patients/patient.routes.js";
import { caregiverRoutes } from "./modules/caregivers/caregiver.routes.js";
import { visitRoutes } from "./modules/visits/visit.routes.js";
import { geocodingRoutes } from "./modules/geocoding/geocoding.routes.js";
import { startGeocodingWorker } from "./modules/geocoding/geocoding.worker.js";
import { billingRoutes } from "./modules/billing/billing.routes.js";
import { billingWebhookRoutes } from "./modules/billing/webhook.routes.js";
import { chatRoutes } from "./modules/chat/chat.routes.js";
import { vehicleRoutes } from "./modules/vehicles/vehicle.routes.js";

const app = Fastify({
  logger: {
    level: env.NODE_ENV === "production" ? "info" : "debug",
    // Sensible Felder niemals loggen.
    redact: ["req.headers.authorization", "*.password", "*.passwordHash", "*.refreshToken"],
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

// Health-Check (für Docker / Monitoring).
app.get("/health", async () => {
  await prisma.$queryRaw`SELECT 1`;
  return { status: "ok", service: "backend", ts: new Date().toISOString() };
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

// Async Geocoding-Worker (in-process für MVP). In Test-Umgebung aus.
if (env.NODE_ENV !== "test") {
  try {
    startGeocodingWorker();
    app.log.info("Geocoding-Worker gestartet");
  } catch (err) {
    app.log.warn({ err }, "Geocoding-Worker konnte nicht gestartet werden");
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
