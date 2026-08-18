import { describe, it, expect } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import { registerMetrics, bearerToken, tokenMatches, registry } from "../../src/lib/metrics.js";

/**
 * Zugang zu /metrics.
 *
 * Der Endpunkt stand auf Railway ohne jede Prüfung im Internet: Routenliste,
 * Anfragezahlen je Statuscode, Antwortzeiten, Node-Version. Der Kommentar im
 * Code nahm Netzisolation an – die gilt für docker-compose, nicht für einen
 * Dienst mit öffentlicher Domain.
 *
 * Zugesichert wird deshalb der Vorgabezustand: ohne Token existiert die Route
 * nicht. Und wenn es sie gibt, verlangt sie das Token.
 */

const TOKEN = "s3hr-langes-scrape-token-fuer-den-test";

/** Routen müssen vor `ready()` stehen, danach lehnt Fastify sie ab. */
async function appWith(
  token?: string,
  routes?: (app: FastifyInstance) => void,
): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  registerMetrics(app, { token });
  routes?.(app);
  await app.ready();
  return app;
}

describe("bearerToken", () => {
  it("liest das Token aus dem Authorization-Header", () => {
    expect(bearerToken("Bearer abc123")).toBe("abc123");
    expect(bearerToken("  Bearer abc123  ")).toBe("abc123");
  });

  it("liefert undefined bei fehlendem oder fremdem Schema", () => {
    expect(bearerToken(undefined)).toBeUndefined();
    expect(bearerToken("")).toBeUndefined();
    expect(bearerToken("Basic abc123")).toBeUndefined();
    expect(bearerToken("Bearer")).toBeUndefined();
  });
});

describe("tokenMatches", () => {
  it("vergleicht den vollständigen Wert", () => {
    expect(tokenMatches(TOKEN, TOKEN)).toBe(true);
    expect(tokenMatches(TOKEN, `${TOKEN}x`)).toBe(false);
    // Kein Präfixvergleich: ein Teiltreffer ist kein Treffer.
    expect(tokenMatches(TOKEN, TOKEN.slice(0, 10))).toBe(false);
    expect(tokenMatches(TOKEN, undefined)).toBe(false);
    expect(tokenMatches(TOKEN, "")).toBe(false);
  });
});

describe("/metrics", () => {
  it("existiert ohne Token gar nicht", async () => {
    // Der Kern: kein Token, keine Route. Nicht "offen, aber leer".
    const app = await appWith(undefined);
    const res = await app.inject({ method: "GET", url: "/metrics" });

    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it("weist eine Anfrage ohne Token ab", async () => {
    const app = await appWith(TOKEN);
    const res = await app.inject({ method: "GET", url: "/metrics" });

    expect(res.statusCode).toBe(401);
    expect(res.body).not.toContain("http_requests_total");
    await app.close();
  });

  it("weist ein falsches Token ab", async () => {
    const app = await appWith(TOKEN);
    const res = await app.inject({
      method: "GET",
      url: "/metrics",
      headers: { authorization: "Bearer falsch" },
    });

    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it("liefert die Metriken mit gültigem Token", async () => {
    const app = await appWith(TOKEN);
    const res = await app.inject({
      method: "GET",
      url: "/metrics",
      headers: { authorization: `Bearer ${TOKEN}` },
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("text/plain");
    expect(res.body).toContain("http_requests_total");
    await app.close();
  });

  it("zählt Anfragen nur, wenn der Endpunkt aktiv ist", async () => {
    // Ohne Token wird auch kein onResponse-Hook gesetzt: was niemand abholt,
    // muss nicht erhoben werden. Zwei unterschiedliche Routennamen, weil die
    // Registry prozessweit ist und beide Fälle sonst dieselbe Zeitreihe träfen.
    const off = await appWith(undefined, (a) => a.get("/ping-off", async () => ({ ok: true })));
    await off.inject({ method: "GET", url: "/ping-off" });

    const on = await appWith(TOKEN, (a) => a.get("/ping-on", async () => ({ ok: true })));
    await on.inject({ method: "GET", url: "/ping-on" });

    const scraped = await registry.metrics();
    expect(scraped).toContain('route="/ping-on"');
    expect(scraped).not.toContain('route="/ping-off"');

    await off.close();
    await on.close();
  });
});
