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
  /**
   * Dauer jeder Prüfung in Millisekunden.
   *
   * Warum das hier steht: von aussen war zu sehen, DASS /health rund eine
   * Sekunde braucht, aber nicht WOFÜR. Beide Prüfungen laufen parallel und
   * meldeten nur "up" – die Gesamtdauer ist das Maximum von zweien, und welche
   * der beiden es ist, blieb offen. Ein `SELECT 1` und ein `PING` sollten
   * zusammen unter 20 ms liegen; alles darüber ist die Antwort auf die Frage,
   * warum jede API-Anfrage träge wirkt.
   *
   * Dieselbe Überlegung wie beim Commit-Hash weiter unten: eine Sonde, die man
   * von aussen ohne Zugang zum Hoster ablesen kann, ist beim ersten Zwischenfall
   * mehr wert als jede nachträgliche Rekonstruktion.
   *
   * `total` ist NICHT die Summe: die Prüfungen laufen nebeneinander. Liegt total
   * deutlich über dem Maximum der beiden, kostet nicht die Abhängigkeit Zeit,
   * sondern der Prozess selbst (Ereignisschleife blockiert, CPU gedrosselt).
   */
  timings: {
    database: number;
    redis: number;
    total: number;
  };
}

/**
 * Ab wann eine Abhängigkeit als träge gilt.
 *
 * `SELECT 1` und `PING` sind je ein Rundlauf. Innerhalb desselben
 * Rechenzentrums liegen sie im einstelligen Millisekundenbereich, über eine
 * Region hinweg bei wenigen Dutzend. 250 ms sind also bereits eine Größenordnung
 * daneben – niedrig genug, um das Problem zu zeigen, hoch genug, um bei einem
 * normalen Ausschlag zu schweigen.
 */
export const SLOW_CHECK_MS = 250;

/**
 * Welche Prüfungen über der Schwelle liegen.
 *
 * Getrennt von der Messung, damit der Aufrufer daraus eine Logzeile machen kann:
 * eine Trägheit, die nur beim manuellen Abruf von /health sichtbar wird, merkt
 * niemand. Im Log fällt sie auf, auch wenn sie nur zeitweise auftritt.
 */
export function slowChecks(
  timings: HealthReport["timings"],
  thresholdMs: number = SLOW_CHECK_MS,
): string[] {
  return (["database", "redis"] as const).filter((name) => timings[name] > thresholdMs);
}

/** Misst die Dauer einer Prüfung, ohne ihr Ergebnis zu verändern. */
async function timed<T>(fn: () => Promise<T>): Promise<{ value: T; ms: number }> {
  const started = process.hrtime.bigint();
  const value = await fn();
  return { value, ms: Number(process.hrtime.bigint() - started) / 1e6 };
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
  const started = process.hrtime.bigint();
  const [database, redis] = await Promise.all([timed(checkDatabase), timed(checkRedis)]);
  const total = Number(process.hrtime.bigint() - started) / 1e6;

  const status = database.value === "up" && redis.value === "up" ? "ok" : "degraded";
  return {
    status,
    service: "backend",
    version: shortCommit(env.GIT_COMMIT_SHA ?? env.RAILWAY_GIT_COMMIT_SHA),
    ts: new Date().toISOString(),
    checks: { database: database.value, redis: redis.value },
    // Auf ganze Millisekunden gerundet: Bruchteile suggerierten eine Genauigkeit,
    // die eine Netzmessung nicht hat, und die Zahl soll im Browser lesbar sein.
    timings: {
      database: Math.round(database.ms),
      redis: Math.round(redis.ms),
      total: Math.round(total),
    },
  };
}
