import { EventEmitter } from "node:events";
import { Redis as IORedis } from "ioredis";
import { env } from "../config/env.js";

/**
 * Echtzeit-Verteilung an offene WebSockets.
 *
 * Transport: Redis Pub/Sub (Kanal `<art>:<orgId>`), damit die Verteilung auch
 * prozess-/instanzübergreifend funktioniert (mehrere Backend-Instanzen, später
 * isolierte Dienste). EINE gemeinsame Subscriber-Verbindung fächert per
 * In-Process-EventEmitter an alle WS-Verbindungen dieser Instanz auf.
 *
 * ZWEI Arten teilen sich diesen Weg: `tracking` (GPS-Positionen an die
 * Koordination) und `chat` (Nachrichten in beide Richtungen). Sie hier
 * zusammenzulegen statt den Mechanismus ein zweites Mal zu bauen, hat einen
 * praktischen Grund: eine zweite Redis-Verbindung je Backend-Instanz, ein
 * zweiter Emitter und ein zweiter Satz Fehlerbehandlung wären dieselbe Logik
 * mit einer eigenen Gelegenheit, auseinanderzulaufen.
 *
 * Der Emitter-Schlüssel ist der VOLLE Kanalname und nicht die Organisation:
 * sonst bekäme ein Chat-Abonnent die Positionen desselben Tenants mit.
 */

/** Arten von Echtzeit-Strömen. Der Wert ist zugleich das Kanal-Präfix. */
export type RealtimeKind = "tracking" | "chat";

const KINDS: readonly RealtimeKind[] = ["tracking", "chat"];

function channelOf(kind: RealtimeKind, orgId: string): string {
  return `${kind}:${orgId}`;
}

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

/** Startet (einmalig) den gemeinsamen Subscriber auf alle Arten. */
function ensureSubscriber(): void {
  if (subscriber) return;
  subscriber = new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null });
  subscriber.on("error", (err) => console.warn("[realtime] Subscriber-Fehler:", err.message));
  for (const kind of KINDS) void subscriber.psubscribe(`${kind}:*`);
  subscriber.on("pmessage", (_pattern, channel, message) => {
    try {
      // Der volle Kanalname als Schlüssel: `chat:<org>` und `tracking:<org>`
      // dürfen sich nicht vermischen.
      emitter.emit(channel, JSON.parse(message));
    } catch {
      // Ungültige Nutzlast ignorieren.
    }
  });
}

/**
 * Veröffentlicht ein Ereignis an alle Beobachter des Tenants. Best-effort:
 * ist Redis nicht erreichbar, schlägt die auslösende Handlung NICHT fehl –
 * nur der Live-Push entfällt. Eine gespeicherte Nachricht ist gespeichert,
 * auch wenn niemand sie sofort sieht; die Gegenseite holt sie beim nächsten
 * Laden. Umgekehrt wäre eine Nachricht, die am Push scheitert und deshalb gar
 * nicht erst geschrieben wird, verloren.
 */
async function publish(kind: RealtimeKind, orgId: string, event: unknown): Promise<void> {
  try {
    await getPublisher().publish(channelOf(kind, orgId), JSON.stringify(event));
  } catch (err) {
    console.warn("[realtime] publish fehlgeschlagen, übersprungen:", err);
  }
}

/**
 * Abonniert einen Strom eines Tenants. Liefert eine Unsubscribe-Funktion, die
 * beim Schließen der WS-Verbindung aufgerufen werden MUSS (kein Leak).
 */
function subscribe<T>(kind: RealtimeKind, orgId: string, handler: (event: T) => void): () => void {
  ensureSubscriber();
  const channel = channelOf(kind, orgId);
  // Eigene Hülle statt `handler` direkt: nur so lässt sich derselbe
  // Funktionswert später wieder abmelden, und der Aufrufer behält seinen Typ.
  const listener = (...args: unknown[]): void => handler(args[0] as T);
  emitter.on(channel, listener);
  return () => emitter.off(channel, listener);
}

// ── Tracking (GPS an die Koordination) ────────────────────────────────────

export async function publishPosition(orgId: string, event: TrackingEvent): Promise<void> {
  return publish("tracking", orgId, event);
}

export function subscribeToOrg(orgId: string, handler: (event: TrackingEvent) => void): () => void {
  return subscribe<TrackingEvent>("tracking", orgId, handler);
}

// ── Chat (Nachrichten in beide Richtungen) ────────────────────────────────

/**
 * Eine neue Nachricht, wie sie an die offenen Sockets geht.
 *
 * `caregiverId` ist NICHT nur Beiwerk: der Kanal trägt den ganzen Tenant, und
 * jeder Abonnent filtert damit auf die Konversation, die ihn angeht. Eine
 * Fachkraft bekommt so nie die Unterhaltung einer Kollegin zu sehen, obwohl
 * beide auf demselben Kanal hören.
 */
export interface ChatEvent {
  id: string;
  caregiverId: string;
  body: string;
  createdAt: string;
  sender: { id: string; email: string; role: string };
}

export async function publishChatMessage(orgId: string, event: ChatEvent): Promise<void> {
  return publish("chat", orgId, event);
}

export function subscribeToOrgChat(
  orgId: string,
  handler: (event: ChatEvent) => void,
): () => void {
  return subscribe<ChatEvent>("chat", orgId, handler);
}
