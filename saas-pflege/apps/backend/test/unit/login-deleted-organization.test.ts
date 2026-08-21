import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * Anmeldung bei gelöschter Organisation.
 *
 * Zwei Zusicherungen, die zusammengehören:
 *
 *   1. Ist die Organisation gelöscht, kommt niemand mehr herein – sonst wäre
 *      die Löschung im Panel reine Anzeige.
 *   2. Ist der Löschstatus NICHT lesbar, wird trotzdem angemeldet.
 *
 * Die zweite ist die Lehre aus einem Ausfall: derselbe Filter, als Join in der
 * Kandidatensuche geschrieben, hat in Produktion jede Anmeldung unmöglich
 * gemacht, weil der Pooler einen veralteten Plan servierte. Eine
 * Zusatzprüfung darf das Produkt nicht schliessen (dieselbe Abwägung wie bei
 * der Token-Sperrliste).
 */

const { findMany, update, findUnique, refreshTokenCreate } = vi.hoisted(() => ({
  findMany: vi.fn(),
  update: vi.fn(async () => ({})),
  findUnique: vi.fn(),
  refreshTokenCreate: vi.fn(async () => ({})),
}));

vi.mock("@len-len/database", async () => {
  const actual = await vi.importActual<typeof import("@len-len/database")>("@len-len/database");
  return {
    ...actual,
    prisma: {
      user: { findMany, update },
      organization: { findUnique },
      refreshToken: { create: refreshTokenCreate },
    },
  };
});

vi.mock("../../src/lib/password.js", () => ({
  verifyPassword: async (hash: string, password: string) => hash === `hash-${password}`,
  hashPassword: async (p: string) => `hash-${p}`,
}));

const { login } = await import("../../src/modules/auth/auth.service.js");

const ACCOUNT = {
  id: "u1",
  organizationId: "org-1",
  email: "chef@demo.de",
  passwordHash: "hash-geheim",
  role: "STRUKTUR_ADMIN",
  isActive: true,
  mustChangePassword: false,
};

beforeEach(() => {
  vi.clearAllMocks();
  findMany.mockResolvedValue([ACCOUNT]);
});

describe("login et organisation supprimée", () => {
  it("laisse entrer quand l'organisation est vivante", async () => {
    findUnique.mockResolvedValue({ deletedAt: null });

    const result = await login({ email: ACCOUNT.email, password: "geheim" });
    expect(result.accessToken).toBeTruthy();
  });

  it("refuse quand l'organisation est supprimée", async () => {
    findUnique.mockResolvedValue({ deletedAt: new Date("2026-08-20T10:00:00Z") });

    await expect(login({ email: ACCOUNT.email, password: "geheim" })).rejects.toThrow(
      "Ungültige Anmeldedaten",
    );
  });

  it("ne nomme pas la suppression dans la réponse", async () => {
    // Même message que pour un mot de passe faux : l'état d'une organisation
    // ne regarde pas celui qui frappe à la porte.
    findUnique.mockResolvedValue({ deletedAt: new Date() });
    const err = await login({ email: ACCOUNT.email, password: "geheim" }).catch((e: unknown) => e);

    expect((err as Error).message).toBe("Ungültige Anmeldedaten");
    expect((err as Error).message).not.toMatch(/gelöscht|deleted|Organisation/i);
  });

  it("laisse entrer si le statut de suppression est illisible", async () => {
    // Le cœur de la leçon : une couche supplémentaire ne ferme pas le produit.
    findUnique.mockRejectedValue(new Error("cached plan must not change result type"));

    const result = await login({ email: ACCOUNT.email, password: "geheim" });
    expect(result.accessToken).toBeTruthy();
  });

  it("ne consulte pas l'organisation quand le mot de passe est faux", async () => {
    // Une tentative ratée ne doit rien coûter de plus qu'avant : c'est ce qui
    // rend la vérification séparée acceptable.
    findUnique.mockResolvedValue({ deletedAt: null });

    await expect(login({ email: ACCOUNT.email, password: "faux" })).rejects.toThrow();
    expect(findUnique).not.toHaveBeenCalled();
  });

  it("n'ajoute pas de jointure à la recherche des comptes", async () => {
    // La requête qui porte l'authentification doit rester exactement celle qui
    // a fait ses preuves — sans `organization` dans le where.
    findUnique.mockResolvedValue({ deletedAt: null });
    await login({ email: ACCOUNT.email, password: "geheim" });

    const [args] = findMany.mock.calls[0] as [{ where: Record<string, unknown> }];
    expect(args.where).not.toHaveProperty("organization");
  });
});
