import { Redis as IORedis } from "ioredis";
import { prisma } from "@len-len/database";
import { env } from "../config/env.js";

export type CheckStatus = "up" | "down";

export interface HealthReport {
  status: "ok" | "degraded";
  service: "backend";
  ts: string;
  checks: {
    database: CheckStatus;
    redis: CheckStatus;
  };
}

/**
 * Dedizierte, kurzlebige Redis-Verbindung nur für den Health-Check. `lazyConnect`
 * + niedrige Timeouts sorgen dafür, dass ein nicht erreichbares Redis den Check
 * schnell mit "down" beantwortet, statt den Request hängen zu lassen.
 */
let healthRedis: IORedis | undefined;
function getHealthRedis(): IORedis {
  if (!healthRedis) {
    healthRedis = new IORedis(env.REDIS_URL, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      connectTimeout: 1000,
      enableOfflineQueue: false,
      // Verbindungsfehler nicht als unhandled 'error' werfen lassen.
      retryStrategy: () => null,
    });
    healthRedis.on("error", () => undefined);
  }
  return healthRedis;
}

async function checkDatabase(): Promise<CheckStatus> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return "up";
  } catch {
    return "down";
  }
}

async function checkRedis(): Promise<CheckStatus> {
  try {
    const client = getHealthRedis();
    if (client.status !== "ready") await client.connect();
    const pong = await client.ping();
    return pong === "PONG" ? "up" : "down";
  } catch {
    return "down";
  }
}

/**
 * Prüft die kritischen Abhängigkeiten (Postgres + Redis) parallel und fasst sie
 * zu einem Gesamtstatus zusammen. Wirft nie – der Aufrufer wählt anhand von
 * `status` den passenden HTTP-Code (200 = ok, 503 = degraded).
 */
export async function runHealthCheck(): Promise<HealthReport> {
  const [database, redis] = await Promise.all([checkDatabase(), checkRedis()]);
  const status = database === "up" && redis === "up" ? "ok" : "degraded";
  return {
    status,
    service: "backend",
    ts: new Date().toISOString(),
    checks: { database, redis },
  };
}
