import { describe, it, expect } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import rateLimit from "@fastify/rate-limit";

/**
 * Rate-Limit und die Frage, WER da eigentlich anfragt.
 *
 * In Produktion gemessen: 13 Anmeldeversuche hintereinander, kein einziges
 * 429, und ein Zähler, der zwischen 6 und 9 sprang. Zwei Ursachen, die sich
 * überlagerten – der Zähler lag im Arbeitsspeicher je Instanz, und hinter dem
 * Proxy war die Absender-IP nicht die des Anfragenden.
 *
 * Beim Beheben lauert die eigentliche Falle: `trustProxy: true` glaubt dem
 * ganzen `X-Forwarded-For`. Dann setzt der Angreifer den Header selbst, bekommt
 * für jeden Versuch einen frischen Zähler und das Limit ist umgangen – während
 * es in der Konfiguration steht und nach Schutz aussieht. Genau diesen
 * Unterschied halten die folgenden Tests fest.
 */

async function appWith(trustProxy: boolean | number): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, trustProxy });
  // Speicher-Zähler: die Frage hier ist die Schlüsselwahl, nicht der Speicher.
  await app.register(rateLimit, { max: 3, timeWindow: "1 minute" });
  app.post("/auth/login", async () => ({ ok: true }));
  await app.ready();
  return app;
}

/** Feuert n Anfragen und liefert die Statuscodes. */
async function fire(
  app: FastifyInstance,
  n: number,
  forwardedFor?: (i: number) => string,
): Promise<number[]> {
  const codes: number[] = [];
  for (let i = 0; i < n; i++) {
    const res = await app.inject({
      method: "POST",
      url: "/auth/login",
      ...(forwardedFor ? { headers: { "x-forwarded-for": forwardedFor(i) } } : {}),
    });
    codes.push(res.statusCode);
  }
  return codes;
}

describe("Rate-Limit hinter einem Proxy", () => {
  it("bremst denselben Absender nach dem Limit", async () => {
    const app = await appWith(0);
    const codes = await fire(app, 5);

    expect(codes.slice(0, 3)).toEqual([200, 200, 200]);
    expect(codes.slice(3)).toEqual([429, 429]);
    await app.close();
  });

  it("ignoriert einen selbst gesetzten X-Forwarded-For (trustProxy 0)", async () => {
    // Der Kern. Ein Angreifer, der bei jedem Versuch eine andere Absender-IP
    // behauptet, darf keinen frischen Zähler bekommen.
    const app = await appWith(0);
    const codes = await fire(app, 5, (i) => `203.0.113.${i}`);

    expect(codes).toContain(429);
    await app.close();
  });

  it("zeigt, warum trustProxy: true hier falsch wäre", async () => {
    // Dieser Test hält den Fehler fest, den die Konfiguration NICHT machen
    // darf: mit blindem Vertrauen in den Header läuft das Limit ins Leere.
    const app = await appWith(true);
    const codes = await fire(app, 5, (i) => `203.0.113.${i}`);

    expect(codes).not.toContain(429);
    await app.close();
  });

  it("trennt echte Absender weiterhin voneinander", async () => {
    // Mit einem vertrauenswürdigen Proxy (1 Sprung) zählt die vom Proxy
    // angehängte IP: zwei verschiedene Besucher teilen sich keinen Zähler.
    const app = await appWith(1);
    const a = await fire(app, 3, () => "198.51.100.7");
    const b = await fire(app, 3, () => "198.51.100.8");

    expect(a).toEqual([200, 200, 200]);
    expect(b).toEqual([200, 200, 200]);
    await app.close();
  });
});
