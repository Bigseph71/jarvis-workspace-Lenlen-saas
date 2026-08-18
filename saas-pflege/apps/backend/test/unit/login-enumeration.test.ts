import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * Was /auth/login preisgibt, bevor das Passwort stimmt.
 *
 * Vorher entschied allein die Trefferzahl über die Antwort: zwei Konten mit
 * derselben Adresse ergaben "E-Mail in mehreren Organisationen vorhanden" –
 * ohne Passwort, für jeden. Über einen öffentlichen Endpunkt liess sich damit
 * abfragen, welche Adressen auf der Plattform mehrfach geführt werden.
 *
 * Der Integrationstest (login-enumeration.int.test.ts) prüft dasselbe gegen
 * eine echte Datenbank; hier läuft es ohne, damit die Zusicherung in jedem
 * Lauf mitgeprüft wird und nicht nur dort, wo Postgres bereitsteht.
 */

const findMany = vi.fn();
const update = vi.fn(async () => ({}));
const refreshTokenCreate = vi.fn(async () => ({}));

vi.mock("@len-len/database", async () => {
  const actual = await vi.importActual<typeof import("@len-len/database")>("@len-len/database");
  return {
    ...actual,
    prisma: {
      user: { findMany, update },
      refreshToken: { create: refreshTokenCreate },
    },
  };
});

// Passwort "richtig" trifft genau die Konten, deren Hash "hash-richtig" lautet.
vi.mock("../../src/lib/password.js", () => ({
  verifyPassword: async (hash: string, password: string) => hash === `hash-${password}`,
  hashPassword: async (p: string) => `hash-${p}`,
}));

const { login } = await import("../../src/modules/auth/auth.service.js");

interface FakeUser {
  id: string;
  organizationId: string;
  email: string;
  passwordHash: string;
  role: string;
  isActive: boolean;
  mustChangePassword: boolean;
}

function account(id: string, org: string, password: string): FakeUser {
  return {
    id,
    organizationId: org,
    email: "doppel@demo.de",
    passwordHash: `hash-${password}`,
    role: "STRUKTUR_ADMIN",
    isActive: true,
    mustChangePassword: false,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("login bei mehrfach geführter Adresse", () => {
  it("antwortet mit falschem Passwort generisch, ohne die Mehrfachlage zu nennen", async () => {
    findMany.mockResolvedValue([account("u1", "org-a", "geheimA"), account("u2", "org-b", "geheimB")]);

    const err = await login({ email: "doppel@demo.de", password: "falsch" }).catch((e: unknown) => e);

    expect((err as Error).message).toBe("Ungültige Anmeldedaten");
    expect((err as Error).message).not.toContain("organizationId");
    expect((err as { statusCode?: number }).statusCode).toBe(401);
  });

  it("antwortet einer unbekannten Adresse wortgleich", async () => {
    findMany.mockResolvedValue([]);

    const err = await login({ email: "niemand@demo.de", password: "falsch" }).catch((e: unknown) => e);

    expect((err as Error).message).toBe("Ungültige Anmeldedaten");
    expect((err as { statusCode?: number }).statusCode).toBe(401);
  });

  it("meldet beim passenden Konto an, ohne nach der Organisation zu fragen", async () => {
    // Das Passwort bestimmt die Organisation – die Rückfrage entfällt.
    findMany.mockResolvedValue([account("u1", "org-a", "geheimA"), account("u2", "org-b", "geheimB")]);

    const result = await login({ email: "doppel@demo.de", password: "geheimB" });

    expect(result.user.organizationId).toBe("org-b");
    expect(result.user.id).toBe("u2");
  });

  it("fragt nur nach, wenn das Passwort in mehreren Organisationen passt", async () => {
    // Echte Mehrdeutigkeit. Der Hinweis geht an jemanden, der das Passwort
    // bereits bewiesen hat.
    findMany.mockResolvedValue([account("u1", "org-a", "gleich"), account("u2", "org-b", "gleich")]);

    const err = await login({ email: "doppel@demo.de", password: "gleich" }).catch((e: unknown) => e);

    expect((err as Error).message).toContain("organizationId");
    expect((err as { statusCode?: number }).statusCode).toBe(409);
  });

  it("deckelt die Zahl der Passwortprüfungen je Versuch", async () => {
    // Ohne Obergrenze liesse sich mit einer in vielen Organisationen angelegten
    // Adresse Rechenzeit erzwingen: jede Prüfung ist ein Argon2-Durchlauf.
    findMany.mockResolvedValue([]);
    await login({ email: "doppel@demo.de", password: "egal" }).catch(() => undefined);

    const [args] = findMany.mock.calls[0] as [{ take?: number }];
    expect(args.take).toBe(5);
  });
});
