import { describe, it, expect, beforeAll, afterAll } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import websocket from "@fastify/websocket";
import { UserRole } from "@len-len/database";
import { signAccessToken } from "../../src/lib/tokens.js";
import { clusteringWsRoutes } from "../../src/modules/clustering/clustering.ws.js";
import { vrptwWsRoutes } from "../../src/modules/vrptw/vrptw.ws.js";
import { trackingWsRoutes } from "../../src/modules/tracking/tracking.ws.js";

/**
 * Die Rollenprüfung an den echten Sockets, nicht nur an der Hilfsfunktion.
 *
 * Der Fehler lag genau dazwischen: die Regel existierte (requireRole am REST),
 * die Handler riefen sie nur nicht auf. Ein Test gegen `authenticateSocket`
 * allein hätte das nie bemerkt. Deshalb läuft hier ein echter Server, und ein
 * echter Client verbindet sich mit dem Token einer nicht berechtigten Rolle.
 *
 * Ohne Datenbank und ohne Redis: Wer abgewiesen wird, kommt gar nicht so weit.
 * Für die berechtigte Rolle wird deshalb nur zugesichert, dass die Verbindung
 * NICHT an den Rechten scheitert – woran sie danach scheitert (kein Redis, keine
 * DB), ist hier gleichgültig.
 */

let app: FastifyInstance;
let baseUrl: string;

const ORG = "22222222-2222-2222-2222-222222222222";
const ROUTE_ID = "33333333-3333-3333-3333-333333333333";

function tokenFor(role: UserRole): string {
  return signAccessToken({ sub: "11111111-1111-1111-1111-111111111111", org: ORG, role });
}

interface CloseInfo {
  code: number;
  reason: string;
}

/** Verbindet und liefert den Schliessgrund (oder "offen" nach dem Zeitfenster). */
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
    // Bleibt der Socket offen, ist die Berechtigung jedenfalls durchgegangen.
    setTimeout(() => done({ code: 0, reason: "offen" }), 2000);
  });
}

beforeAll(async () => {
  app = Fastify({ logger: false });
  await app.register(websocket);
  await app.register(clusteringWsRoutes);
  await app.register(vrptwWsRoutes);
  await app.register(trackingWsRoutes);
  await app.listen({ port: 0, host: "127.0.0.1" });
  const address = app.server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  baseUrl = `ws://127.0.0.1:${port}`;
});

afterAll(async () => {
  await app.close();
});

const STREAMS: { name: string; path: (token: string) => string }[] = [
  {
    name: "/clustering/status/ws",
    path: (t) => `/clustering/status/ws?date=2026-09-07&token=${t}`,
  },
  {
    name: "/routes/:id/status/ws",
    path: (t) => `/routes/${ROUTE_ID}/status/ws?token=${t}`,
  },
  {
    name: "/tracking/live/ws",
    path: (t) => `/tracking/live/ws?token=${t}`,
  },
];

describe.each(STREAMS)("$name", ({ path }) => {
  it("weist eine Fachkraft ab", async () => {
    const info = await connect(path(tokenFor(UserRole.FACHKRAFT)));
    expect(info.code).toBe(1008);
    expect(info.reason).toBe("Keine Berechtigung");
  });

  it("weist die Personalverwaltung ab", async () => {
    // HR hat laut Rollenmodell keinen Zugang zu Patientendaten.
    const info = await connect(path(tokenFor(UserRole.HR)));
    expect(info.code).toBe(1008);
    expect(info.reason).toBe("Keine Berechtigung");
  });

  it("weist ein unlesbares Token ab", async () => {
    const info = await connect(path("kein-jwt"));
    expect(info.code).toBe(1008);
    expect(info.reason).toBe("Nicht authentifiziert");
  });

  it("scheitert beim Koordinator nicht an den Rechten", async () => {
    const info = await connect(path(tokenFor(UserRole.KOORDINATOR)));
    expect(info.reason).not.toBe("Keine Berechtigung");
    expect(info.reason).not.toBe("Nicht authentifiziert");
  });
});
