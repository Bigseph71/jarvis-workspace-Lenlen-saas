import { describe, it, expect, beforeAll, afterAll } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import { UserRole } from "@len-len/database";
import { signAccessToken } from "../../src/lib/tokens.js";
import { requireSuperAdmin } from "../../src/plugins/require-super-admin.js";
import { AppError } from "../../src/lib/errors.js";

/**
 * Zugang zum Super-Admin-Panel.
 *
 * Die Abfragen unter /admin laufen ohne Tenant-Filter und ohne RLS – dieser
 * Wächter ist die einzige Schicht davor. Ein Struktur-Admin ist der
 * gefährlichste Fall: er ist in seiner eigenen Organisation allmächtig und
 * käme über /admin an alle anderen.
 */

let app: FastifyInstance;

function tokenFor(role: UserRole, extra: { chpw?: boolean } = {}): string {
  return signAccessToken({
    sub: "11111111-1111-1111-1111-111111111111",
    org: "22222222-2222-2222-2222-222222222222",
    role,
    ...extra,
  });
}

async function call(token?: string): Promise<{ status: number; body: string }> {
  const res = await app.inject({
    method: "GET",
    url: "/admin/ping",
    ...(token ? { headers: { authorization: `Bearer ${token}` } } : {}),
  });
  return { status: res.statusCode, body: res.body };
}

beforeAll(async () => {
  app = Fastify({ logger: false });
  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof AppError) {
      return reply.status(error.statusCode).send({ error: error.code });
    }
    return reply.status(500).send({ error: "InternalServerError" });
  });
  await app.register(async (instance) => {
    instance.addHook("preHandler", requireSuperAdmin);
    instance.get("/admin/ping", async (request) => ({ ok: true, role: request.user?.role }));
  });
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

describe("requireSuperAdmin", () => {
  it("lässt den Super-Admin durch", async () => {
    const res = await call(tokenFor(UserRole.SUPER_ADMIN));
    expect(res.status).toBe(200);
    expect(res.body).toContain("SUPER_ADMIN");
  });

  it("weist den Struktur-Admin ab", async () => {
    // Der Kern: in seiner Organisation darf er alles, hier nichts.
    const res = await call(tokenFor(UserRole.STRUKTUR_ADMIN));
    expect(res.status).toBe(403);
  });

  it("weist jede andere Rolle ab", async () => {
    for (const role of [UserRole.KOORDINATOR, UserRole.HR, UserRole.FACHKRAFT]) {
      const res = await call(tokenFor(role));
      expect(res.status, `Rolle ${role}`).toBe(403);
    }
  });

  it("weist ohne Token ab", async () => {
    expect((await call()).status).toBe(401);
  });

  it("weist ein unlesbares Token ab", async () => {
    expect((await call("kein-jwt")).status).toBe(401);
  });

  it("weist einen Super-Admin mit erzwungenem Passwortwechsel ab", async () => {
    // Das Konto ist bis zum Wechsel funktionslos – erst recht hier.
    const res = await call(tokenFor(UserRole.SUPER_ADMIN, { chpw: true }));
    expect(res.status).toBe(403);
  });

  it("verrät im Fehlerfall nicht, welche Rolle nötig wäre", async () => {
    // Die Antwort soll nicht bestätigen, dass es ein Super-Admin-Panel gibt.
    const res = await call(tokenFor(UserRole.FACHKRAFT));
    expect(res.body).not.toContain("SUPER_ADMIN");
  });
});
