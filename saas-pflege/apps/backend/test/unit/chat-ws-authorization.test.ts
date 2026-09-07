import { describe, it, expect, beforeAll, afterAll } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import websocket from "@fastify/websocket";
import { UserRole } from "@len-len/database";
import { signAccessToken } from "../../src/lib/tokens.js";
import { chatWsRoutes } from "../../src/modules/chat/chat.ws.js";

/**
 * Wer den Chat-Strom öffnen darf, und auf welche Konversation.
 *
 * Der Kanal trägt den GANZEN Tenant: alle Unterhaltungen aller Fachkräfte
 * laufen über dieselbe Redis-Verteilung. Gefiltert wird erst im Handler. Ein
 * Fehler an dieser Stelle gibt einer Fachkraft die Unterhaltungen ihrer
 * Kolleginnen -- also Gesundheitsdaten von Patienten, die sie nicht betreut.
 *
 * Wie bei den übrigen Sockets läuft hier ein echter Server: die Regel muss am
 * Handler hängen und nicht nur in einer Hilfsfunktion existieren.
 *
 * Ohne Datenbank: wer abgewiesen wird, kommt gar nicht so weit. Für die
 * zugelassene Rolle wird nur zugesichert, dass es NICHT an den Rechten
 * scheitert -- woran danach (keine DB), ist hier gleichgültig.
 */

let app: FastifyInstance;
let baseUrl: string;

const ORG = "22222222-2222-2222-2222-222222222222";
const OTHER_CAREGIVER = "44444444-4444-4444-4444-444444444444";

function tokenFor(role: UserRole): string {
  return signAccessToken({ sub: "11111111-1111-1111-1111-111111111111", org: ORG, role });
}

interface CloseInfo {
  code: number;
  reason: string;
}

function connect(path: string): Promise<CloseInfo> {
  return new Promise((resolve) => {
    const ws = new WebSocket(`${baseUrl}${path}`);
    let settled = false;
    const done = (info: CloseInfo): void => {
      if (settled) return;
      settled = true;
      try {
        ws.close();
      } catch {
        /* egal */
      }
      resolve(info);
    };
    ws.onclose = (e) => done({ code: e.code, reason: e.reason });
    ws.onerror = () => done({ code: -1, reason: "error" });
    setTimeout(() => done({ code: 0, reason: "offen" }), 2000);
  });
}

beforeAll(async () => {
  app = Fastify({ logger: false });
  await app.register(websocket);
  await app.register(chatWsRoutes);
  await app.listen({ port: 0, host: "127.0.0.1" });
  const address = app.server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  baseUrl = `ws://127.0.0.1:${port}`;
});

afterAll(async () => {
  await app.close();
});

describe("/chat/ws", () => {
  it("weist die Personalverwaltung ab", async () => {
    // HR hat keinen Zugang zum Chat (chat.routes: canChat), und der Strom
    // trägt dieselben Inhalte wie die REST-Antwort.
    const info = await connect(`/chat/ws?token=${tokenFor(UserRole.HR)}`);

    expect(info.code).toBe(1008);
    expect(info.reason).toBe("Keine Berechtigung");
  });

  it("weist den Super-Admin ab", async () => {
    // Datenminimierung: er betreibt die Plattform und hat in den Nachrichten
    // eines Kunden nichts verloren.
    const info = await connect(`/chat/ws?token=${tokenFor(UserRole.SUPER_ADMIN)}`);

    expect(info.code).toBe(1008);
    expect(info.reason).toBe("Keine Berechtigung");
  });

  it("weist eine Anfrage ohne Token ab", async () => {
    const info = await connect("/chat/ws");

    expect(info.code).toBe(1008);
  });

  it("weist eine Fachkraft ab, die eine FREMDE Konversation verlangt", async () => {
    // Der Kern dieses Sockets. Der Parameter wird abgewiesen und nicht
    // stillschweigend übergangen: wer ihn mitschickt, hält sich sonst für
    // berechtigt und merkt den Unterschied nie.
    const info = await connect(
      `/chat/ws?token=${tokenFor(UserRole.FACHKRAFT)}&caregiverId=${OTHER_CAREGIVER}`,
    );

    expect(info.code).toBe(1008);
    expect(info.reason).toBe("Fachkräfte haben nur Zugriff auf die eigene Konversation");
  });

  it("laesst den Koordinator an den Rechten nicht scheitern", async () => {
    const info = await connect(`/chat/ws?token=${tokenFor(UserRole.KOORDINATOR)}`);

    expect(info.reason).not.toBe("Keine Berechtigung");
  });

  it("laesst eine Fachkraft OHNE Parameter an den Rechten nicht scheitern", async () => {
    // Ihre Konversation bestimmt ihr Konto, nicht die Adresszeile.
    const info = await connect(`/chat/ws?token=${tokenFor(UserRole.FACHKRAFT)}`);

    expect(info.reason).not.toBe("Keine Berechtigung");
    expect(info.reason).not.toBe("Fachkräfte haben nur Zugriff auf die eigene Konversation");
  });
});
