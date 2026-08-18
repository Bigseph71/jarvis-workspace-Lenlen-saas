import { Redis as IORedis } from "ioredis";
import { prisma } from "@len-len/database";
import { env } from "../config/env.js";

export type CheckStatus = "up" | "down";

export interface HealthReport {
  status: "ok" | "degraded";
  service: "backend";
  /** Kurzform des Commits, oder "unknown" wenn der Hoster ihn nicht liefert. */
  version: string;
  ts: string;
  checks: {
    database: CheckStatus;
    redis: CheckStatus;
  };
}

/**
 * Sieben Zeichen des Commits – dieselbe Kurzform, die `git log --oneline`
 * zeigt, also direkt mit dem Verlauf vergleichbar.
 *
 * Warum das hier steht: nach einem Merge lässt sich sonst von aussen nicht
 * feststellen, welcher Stand tatsächlich läuft. Solange /metrics offen im Netz
 * stand, verriet `process_start_time_seconds` wenigstens den Startzeitpunkt;
 * seit der Endpunkt zu ist, fehlte jede Auskunft. Beim ersten Fehlerbericht
 * eines Kunden ist "welche Version lief da?" die erste Frage.
 *
 * Der Commit-Hash eines privaten Repositories ist kein Geheimnis: er erlaubt
 * niemandem, den Code zu lesen.
 */
export function shortCommit(sha: string | undefined): string {
  const trimmed = sha?.trim();
  return trimmed ? trimmed.slice(0, 7) : "unknown";
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
    version: shortCommit(env.GIT_COMMIT_SHA ?? env.RAILWAY_GIT_COMMIT_SHA),
    ts: new Date().toISOString(),
    checks: { database, redis },
  };
}
