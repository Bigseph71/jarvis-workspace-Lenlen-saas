import { chatSocketUrl, type ChatSocketMessage } from "@len-len/api-client";

/**
 * Live-Verbindung des Chats, mit Rückfall auf Abfragen im Takt.
 *
 * WARUM MIT RÜCKFALL. Ein WebSocket ist auf einem Telefon nicht
 * selbstverständlich: Firmennetze und öffentliche WLANs blockieren ihn
 * gelegentlich, und beim Wechsel Mobilfunk/WLAN stirbt er still. Ein Chat, der
 * dann einfach nichts mehr zeigt, ist schlechter als einer, der langsam ist --
 * die Fachkraft merkt den Unterschied erst, wenn eine Antwort ausbleibt, die
 * längst geschrieben wurde.
 *
 * Deshalb: solange die Verbindung steht, kommen Nachrichten sofort (`onMessage`);
 * steht sie nicht, wird weiter abgefragt (`onFallbackTick`). Der Aufrufer muss
 * nicht wissen, welcher Fall gerade gilt.
 *
 * Als eigene Datei und nicht im Bildschirm, weil hier die einzige Logik liegt,
 * die sich ohne React Native prüfen lässt -- und weil sie sonst in einem
 * useEffect verschwindet, in dem niemand sie wiederfindet.
 */

/** Takt des Rückfalls. Bewusst kürzer als die früheren 30 s. */
export const FALLBACK_INTERVAL_MS = 10_000;

/** Wartezeit vor einem neuen Verbindungsversuch. */
export const RECONNECT_DELAY_MS = 3_000;

export interface ChatSocketHandlers {
  /** Eine live eingetroffene Nachricht. */
  onMessage: (event: Extract<ChatSocketMessage, { type: "message" }>) => void;
  /** Kein Live-Strom: jetzt wäre ein Abruf fällig. */
  onFallbackTick: () => void;
  /** Zustandswechsel, für die Anzeige. */
  onStateChange?: (connected: boolean) => void;
}

export interface ChatSocketController {
  close: () => void;
}

type SocketFactory = (url: string) => WebSocket;

/**
 * Öffnet den Strom und hält ihn offen.
 *
 * `factory` und die Timer sind injizierbar, damit der Test denselben Ablauf
 * prüfen kann, den das Telefon durchläuft -- ohne echten Socket.
 */
export function connectChat(
  token: string,
  handlers: ChatSocketHandlers,
  options: {
    factory?: SocketFactory;
    fallbackIntervalMs?: number;
    reconnectDelayMs?: number;
  } = {},
): ChatSocketController {
  const factory = options.factory ?? ((url: string) => new WebSocket(url));
  const fallbackMs = options.fallbackIntervalMs ?? FALLBACK_INTERVAL_MS;
  const reconnectMs = options.reconnectDelayMs ?? RECONNECT_DELAY_MS;

  let closed = false;
  let socket: WebSocket | null = null;
  let fallbackTimer: ReturnType<typeof setInterval> | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  const stopFallback = (): void => {
    if (fallbackTimer !== null) {
      clearInterval(fallbackTimer);
      fallbackTimer = null;
    }
  };

  const startFallback = (): void => {
    if (fallbackTimer !== null || closed) return;
    fallbackTimer = setInterval(handlers.onFallbackTick, fallbackMs);
  };

  const open = (): void => {
    if (closed) return;
    // Der Rückfall läuft, BIS die Verbindung bestätigt ist. Ihn erst beim
    // Verbindungsversuch zu stoppen hiesse, während eines gescheiterten
    // Aufbaus gar nichts zu empfangen.
    startFallback();

    let ws: WebSocket;
    try {
      ws = factory(chatSocketUrl(token));
    } catch {
      scheduleReconnect();
      return;
    }
    socket = ws;

    ws.onmessage = (event: { data: unknown }) => {
      let parsed: ChatSocketMessage;
      try {
        parsed = JSON.parse(String(event.data)) as ChatSocketMessage;
      } catch {
        return;
      }
      if (parsed.type === "ready") {
        // Erst JETZT ist gesichert, dass Nachrichten ankommen.
        stopFallback();
        handlers.onStateChange?.(true);
        return;
      }
      if (parsed.type === "message") handlers.onMessage(parsed);
    };

    ws.onerror = () => {
      startFallback();
      handlers.onStateChange?.(false);
    };

    ws.onclose = () => {
      socket = null;
      startFallback();
      handlers.onStateChange?.(false);
      scheduleReconnect();
    };
  };

  const scheduleReconnect = (): void => {
    if (closed || reconnectTimer !== null) return;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      open();
    }, reconnectMs);
  };

  open();

  return {
    close: () => {
      closed = true;
      stopFallback();
      if (reconnectTimer !== null) clearTimeout(reconnectTimer);
      socket?.close();
      socket = null;
    },
  };
}
