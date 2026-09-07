import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { configureApiClient } from "@len-len/api-client";
import { connectChat } from "../src/lib/chat-socket";

// Ohne konfigurierten Client wirft `chatSocketUrl` -- der Verbindungsaufbau
// liefe in den Rückfall, und die Tests prüften still den falschen Zweig.
configureApiClient({
  baseUrl: "http://localhost:4000",
  storage: {
    getAccessToken: () => "jwt",
    setAccessToken: () => {},
    getRefreshToken: () => null,
    setRefreshToken: () => {},
  },
});

/**
 * Live-Verbindung des Chats, mit Rückfall.
 *
 * Der gemeldete Fehler war die Latenz: 30 Sekunden Takt sind zu lang für eine
 * Rückfrage aus dem Treppenhaus. Geprüft wird hier aber vor allem das, was
 * beim Umstieg auf einen Strom schiefgehen KANN und auf dem Telefon niemandem
 * auffällt:
 *
 *   - ein Chat, der still nichts mehr empfängt, weil der Socket tot ist,
 *   - ein Rückfall, der weiterläuft und Verkehr erzeugt, obwohl die Verbindung
 *     längst steht,
 *   - Timer, die nach dem Verlassen des Bildschirms weiterlaufen.
 */

interface FakeSocket {
  url: string;
  onmessage?: (event: { data: unknown }) => void;
  onerror?: () => void;
  onclose?: () => void;
  close: () => void;
  closed: boolean;
}

const sockets: FakeSocket[] = [];

function factory(url: string): WebSocket {
  const socket: FakeSocket = { url, closed: false, close: () => { socket.closed = true; } };
  sockets.push(socket);
  return socket as unknown as WebSocket;
}

const OPTIONS = { factory, fallbackIntervalMs: 1000, reconnectDelayMs: 500 };

function ready(socket: FakeSocket): void {
  socket.onmessage?.({ data: JSON.stringify({ type: "ready", caregiverId: "c-1" }) });
}

beforeEach(() => {
  sockets.length = 0;
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("connectChat", () => {
  it("reicht eine eingetroffene Nachricht sofort weiter", async () => {
    const onMessage = vi.fn();
    connectChat("jwt", { onMessage, onFallbackTick: vi.fn() }, OPTIONS);

    ready(sockets[0]!);
    sockets[0]!.onmessage?.({
      data: JSON.stringify({ type: "message", id: "m-1", caregiverId: "c-1", body: "Hallo" }),
    });

    expect(onMessage).toHaveBeenCalledTimes(1);
    expect(onMessage.mock.calls[0]![0].body).toBe("Hallo");
  });

  it("fragt ab, SOLANGE die Verbindung nicht bestätigt ist", async () => {
    // Der Aufbau kann scheitern oder dauern. Bis "ready" kommt, darf der
    // Bildschirm nicht taub sein.
    const onFallbackTick = vi.fn();
    connectChat("jwt", { onMessage: vi.fn(), onFallbackTick }, OPTIONS);

    await vi.advanceTimersByTimeAsync(2500);

    expect(onFallbackTick).toHaveBeenCalled();
  });

  it("stellt das Abfragen ein, sobald die Verbindung steht", async () => {
    // Sonst liefen Strom UND Takt nebeneinander: doppelter Verkehr auf einem
    // Mobilfunkvertrag, für nichts.
    const onFallbackTick = vi.fn();
    connectChat("jwt", { onMessage: vi.fn(), onFallbackTick }, OPTIONS);

    ready(sockets[0]!);
    onFallbackTick.mockClear();
    await vi.advanceTimersByTimeAsync(5000);

    expect(onFallbackTick).not.toHaveBeenCalled();
  });

  it("nimmt das Abfragen wieder auf, wenn die Verbindung abreisst", async () => {
    // Der Fall, der einen Chat still sterben lässt: WLAN-Wechsel, Proxy,
    // Standby. Ohne diese Zeile zeigt der Bildschirm ab hier nichts mehr.
    const onFallbackTick = vi.fn();
    connectChat("jwt", { onMessage: vi.fn(), onFallbackTick }, OPTIONS);

    ready(sockets[0]!);
    onFallbackTick.mockClear();
    sockets[0]!.onclose?.();
    await vi.advanceTimersByTimeAsync(2500);

    expect(onFallbackTick).toHaveBeenCalled();
  });

  it("baut die Verbindung nach einem Abriss neu auf", async () => {
    connectChat("jwt", { onMessage: vi.fn(), onFallbackTick: vi.fn() }, OPTIONS);
    expect(sockets).toHaveLength(1);

    sockets[0]!.onclose?.();
    await vi.advanceTimersByTimeAsync(600);

    expect(sockets).toHaveLength(2);
  });

  it("meldet den Zustand, damit die Oberflaeche ihn zeigen kann", async () => {
    const onStateChange = vi.fn();
    connectChat("jwt", { onMessage: vi.fn(), onFallbackTick: vi.fn(), onStateChange }, OPTIONS);

    ready(sockets[0]!);
    expect(onStateChange).toHaveBeenLastCalledWith(true);

    sockets[0]!.onclose?.();
    expect(onStateChange).toHaveBeenLastCalledWith(false);
  });

  it("laesst nach close() weder Timer noch Verbindung zurueck", async () => {
    // Ein Bildschirm, den man verlaesst, darf nicht weiter abfragen und sich
    // auch nicht neu verbinden -- sonst summieren sich die Verbindungen mit
    // jedem Oeffnen des Chats.
    const onFallbackTick = vi.fn();
    const connection = connectChat("jwt", { onMessage: vi.fn(), onFallbackTick }, OPTIONS);

    connection.close();
    onFallbackTick.mockClear();
    await vi.advanceTimersByTimeAsync(5000);

    expect(onFallbackTick).not.toHaveBeenCalled();
    expect(sockets).toHaveLength(1);
    expect(sockets[0]!.closed).toBe(true);
  });

  it("uebersteht eine unlesbare Nutzlast", async () => {
    // Ein kaputtes Paket darf den Chat nicht beenden.
    const onMessage = vi.fn();
    connectChat("jwt", { onMessage, onFallbackTick: vi.fn() }, OPTIONS);

    expect(() => sockets[0]!.onmessage?.({ data: "{kein json" })).not.toThrow();
    expect(onMessage).not.toHaveBeenCalled();
  });
});
