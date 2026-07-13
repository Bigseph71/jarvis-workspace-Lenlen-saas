import { EventEmitter } from "node:events";
import { Redis as IORedis } from "ioredis";
import { env } from "../config/env.js";

/**
 * Echtzeit-Verteilung von GPS-Positionen an die Koordination (WebSocket).
 *
 * Transport: Redis Pub/Sub (Kanal `tracking:<orgId>`), damit die Verteilung
 * auch prozess-/instanzübergreifend funktioniert (mehrere Backend-Instanzen,
 * später isolierte Dienste). EINE gemeinsame Subscriber-Verbindung fächert per
 * In-Process-EventEmitter an alle WS-Verbindungen dieser Instanz auf.
 */

const CHANNEL_PREFIX = "tracking:";

/** An die Koordination gepushtes Ereignis (eine aktualisierte Position). */
export interface TrackingEvent {
  caregiverId: string;
  visitId: string | null;
  latitude: number;
  longitude: number;
  accuracy: number | null;
  distanceToPatientM: number | null;
  geofenceBreach: boolean;
  recordedAt: string;
}

const emitter = new EventEmitter();
// Viele Koordinatoren können denselben Tenant beobachten.
emitter.setMaxListeners(0);

let publisher: IORedis | undefined;
let subscriber: IORedis | undefined;

function getPublisher(): IORedis {
  if (!publisher) {
    publisher = new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null, enableOfflineQueue: false });
    publisher.on("error", (err) => console.warn("[realtime] Publisher-Fehler:", err.message));
  }
  return publisher;
}

/** Startet (einmalig) den gemeinsamen Subscriber auf `tracking:*`. */
function ensureSubscriber(): void {
  if (subscriber) return;
  subscriber = new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null });
  subscriber.on("error", (err) => console.warn("[realtime] Subscriber-Fehler:", err.message));
  void subscriber.psubscribe(`${CHANNEL_PREFIX}*`);
  subscriber.on("pmessage", (_pattern, channel, message) => {
    const orgId = channel.slice(CHANNEL_PREFIX.length);
    try {
      emitter.emit(orgId, JSON.parse(message) as TrackingEvent);
    } catch {
      // Ungültige Nutzlast ignorieren.
    }
  });
}

/**
 * Veröffentlicht eine Position an alle Beobachter des Tenants. Best-effort:
 * ist Redis nicht erreichbar, schlägt das Speichern der Position NICHT fehl –
 * nur der Live-Push entfällt.
 */
export async function publishPosition(orgId: string, event: TrackingEvent): Promise<void> {
  try {
    await getPublisher().publish(`${CHANNEL_PREFIX}${orgId}`, JSON.stringify(event));
  } catch (err) {
    console.warn("[realtime] publish fehlgeschlagen, übersprungen:", err);
  }
}

/**
 * Abonniert die Positionen eines Tenants. Liefert eine Unsubscribe-Funktion,
 * die beim Schließen der WS-Verbindung aufgerufen werden MUSS (kein Leak).
 */
export function subscribeToOrg(orgId: string, handler: (event: TrackingEvent) => void): () => void {
  ensureSubscriber();
  emitter.on(orgId, handler);
  return () => emitter.off(orgId, handler);
}
