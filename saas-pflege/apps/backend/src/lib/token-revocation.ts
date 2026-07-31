import { Redis as IORedis } from "ioredis";
import { env } from "../config/env.js";
import { parseDurationMs } from "./tokens.js";

/**
 * Sperrliste für Access-Token.
 *
 * Access-Token sind signiert und werden nicht in der Datenbank geführt: bis zum
 * Ablauf (JWT_ACCESS_TTL) gelten sie weiter, auch wenn das Passwort inzwischen
 * zurückgesetzt wurde. Genau dann soll der Zugriff aber SOFORT enden.
 *
 * Statt bei jedem Request den Benutzer aus der Datenbank zu lesen, hält Redis je
 * Konto einen Zeitstempel: „alles, was vor diesem Moment ausgestellt wurde, gilt
 * nicht mehr". Ein Request kostet damit ein GET, kein SQL.
 *
 * Der Eintrag lebt nur so lange wie ein Access-Token gültig sein kann – danach
 * sind ohnehin alle betroffenen Token abgelaufen.
 */

const KEY_PREFIX = "auth:revoked-before:";

/** Puffer gegen Uhren-Drift zwischen mehreren App-Instanzen. */
const TTL_MARGIN_SECONDS = 60;

function entryTtlSeconds(): number {
  return Math.ceil(parseDurationMs(env.JWT_ACCESS_TTL) / 1000) + TTL_MARGIN_SECONDS;
}

/**
 * Eigene, kurzlebige Verbindung (wie im Health-Check): niedrige Timeouts und
 * `enableOfflineQueue: false`, damit ein nicht erreichbares Redis den Request
 * sofort scheitern lässt, statt ihn hängen zu lassen.
 */
let client: IORedis | undefined;
function getClient(): IORedis {
  if (!client) {
    client = new IORedis(env.REDIS_URL, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      connectTimeout: 1000,
      commandTimeout: 1000,
      enableOfflineQueue: false,
      retryStrategy: () => null,
    });
    client.on("error", () => undefined);
  }
  return client;
}

async function connected(): Promise<IORedis> {
  const c = getClient();
  if (c.status !== "ready") await c.connect();
  return c;
}

/**
 * Sicherung (Circuit Breaker) gegen ein ausgefallenes Redis.
 *
 * Ohne sie zahlt JEDER authentifizierte Request den Verbindungs-Timeout (rund
 * 2 s gemessen) – die API wäre bei einem Redis-Ausfall praktisch unbenutzbar,
 * obwohl sie ohne Sperrliste weiterarbeiten könnte. Nach einem Fehlschlag wird
 * Redis daher für eine Abkühlzeit übersprungen und sofort durchgelassen.
 */
const COOLDOWN_MS = 10_000;
let unavailableUntil = 0;

function isCoolingDown(): boolean {
  return Date.now() < unavailableUntil;
}

function noteFailure(action: string, err: unknown): void {
  // Nur beim Öffnen der Sicherung loggen, nicht bei jedem Request.
  if (!isCoolingDown()) {
    console.warn(`[auth] Sperrliste nicht erreichbar (${action}), pausiert für ${COOLDOWN_MS} ms:`, err);
  }
  unavailableUntil = Date.now() + COOLDOWN_MS;
}

function noteSuccess(): void {
  unavailableUntil = 0;
}

/**
 * Reine Vergleichslogik (ohne Redis, daher direkt testbar).
 *
 * Vergleich in SEKUNDEN und bewusst strikt: ein Token, das in derselben Sekunde
 * wie die Sperre ausgestellt wurde, bleibt gültig. Nur so überlebt das frische
 * Token-Paar, das changePassword unmittelbar nach dem Setzen der Sperre ausgibt.
 *
 * Fehlt `iat`, lässt sich das Token nicht einordnen – dann gilt es bei
 * bestehender Sperre als widerrufen (fail closed).
 */
export function isIssuedBeforeCutoff(iat: number | undefined, cutoff: number | null): boolean {
  if (cutoff === null) return false;
  if (iat === undefined) return true;
  return iat < cutoff;
}

/**
 * Setzt die Sperre für ein Konto: alle bis jetzt ausgestellten Access-Token
 * gelten ab sofort als ungültig.
 *
 * Liefert false, wenn Redis nicht erreichbar war. Der Aufrufer hat sein
 * eigentliches Ziel (Passwort geändert, Refresh-Token widerrufen) dann trotzdem
 * erreicht – nur der sofortige Schnitt fehlt und das Token läuft regulär aus.
 * Deshalb wird der Fehler gemeldet und nicht verschluckt.
 */
export async function revokeAccessTokensBefore(userId: string, at: Date = new Date()): Promise<boolean> {
  if (env.NODE_ENV === "test") return true;
  const cutoff = Math.floor(at.getTime() / 1000);
  try {
    const c = await connected();
    await c.set(`${KEY_PREFIX}${userId}`, String(cutoff), "EX", entryTtlSeconds());
    noteSuccess();
    return true;
  } catch (err) {
    noteFailure("setzen", err);
    return false;
  }
}

/**
 * Prüft ein Access-Token gegen die Sperrliste. Läuft bei JEDEM authentifizierten
 * Request.
 *
 * Ist Redis nicht erreichbar, wird der Request DURCHGELASSEN (fail open): die
 * Sperre ist eine zusätzliche Schicht über den bereits widerrufenen
 * Refresh-Token und dem geänderten Passwort. Fail closed würde die gesamte API
 * bei einem Redis-Aussetzer lahmlegen – ein größerer Schaden als das
 * Zeitfenster, das ohne diese Liste ohnehin bestünde.
 */
export async function isAccessTokenRevoked(userId: string, iat: number | undefined): Promise<boolean> {
  if (env.NODE_ENV === "test" || isCoolingDown()) return false;
  try {
    const c = await connected();
    const raw = await c.get(`${KEY_PREFIX}${userId}`);
    noteSuccess();
    return isIssuedBeforeCutoff(iat, raw === null ? null : Number(raw));
  } catch (err) {
    noteFailure("lesen", err);
    return false;
  }
}
