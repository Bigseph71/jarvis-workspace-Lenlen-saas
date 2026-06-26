import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import { prisma } from "@len-len/database";

const PORT = Number(process.env.BACKEND_PORT ?? 4000);

const app = Fastify({
  logger: {
    level: process.env.NODE_ENV === "production" ? "info" : "debug",
  },
});

await app.register(helmet);
await app.register(cors, {
  origin: process.env.NEXT_PUBLIC_API_URL ? true : false,
  credentials: true,
});
await app.register(rateLimit, {
  max: 100,
  timeWindow: "1 minute",
});

// Health-Check (für Docker / Monitoring)
app.get("/health", async () => {
  await prisma.$queryRaw`SELECT 1`;
  return { status: "ok", service: "backend", ts: new Date().toISOString() };
});

// TODO Phase 1: Auth-Routes, Tenant-Middleware, Patienten/Fachkräfte/Verträge

try {
  await app.listen({ port: PORT, host: "0.0.0.0" });
  app.log.info(`Backend läuft auf :${PORT}`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
