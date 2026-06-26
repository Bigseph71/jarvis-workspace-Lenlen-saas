import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import { ZodError } from "zod";
import { Prisma, prisma } from "@len-len/database";
import { env } from "./config/env.js";
import { AppError } from "./lib/errors.js";
import { authRoutes } from "./modules/auth/auth.routes.js";

const app = Fastify({
  logger: {
    level: env.NODE_ENV === "production" ? "info" : "debug",
    // Sensible Felder niemals loggen.
    redact: ["req.headers.authorization", "*.password", "*.passwordHash", "*.refreshToken"],
  },
});

await app.register(helmet);
await app.register(cors, {
  origin: env.NEXT_PUBLIC_API_URL ? [env.NEXT_PUBLIC_API_URL] : false,
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
  return reply.status(error.statusCode ?? 500).send({ error: "InternalServerError" });
});

// Health-Check (für Docker / Monitoring).
app.get("/health", async () => {
  await prisma.$queryRaw`SELECT 1`;
  return { status: "ok", service: "backend", ts: new Date().toISOString() };
});

await app.register(authRoutes);

// TODO Phase 1: CRUD Patienten / Fachkräfte / Verträge (Tenant-gescoped).

try {
  await app.listen({ port: env.BACKEND_PORT, host: "0.0.0.0" });
  app.log.info(`Backend läuft auf :${env.BACKEND_PORT}`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
