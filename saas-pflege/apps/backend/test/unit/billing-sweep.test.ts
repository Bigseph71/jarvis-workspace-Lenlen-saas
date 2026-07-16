import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * Der Suspendierungs-Lauf ist ein einzelnes UPDATE über ALLE Tenants (System-
 * Pfad, kein withTenant). Geprüft wird deshalb die WHERE-Klausel selbst – sie
 * ist die eigentliche Regel-8-Logik.
 */
const updateMany = vi.fn(async () => ({ count: 2 }));

vi.mock("@len-len/database", async () => {
  const actual = await vi.importActual<typeof import("@len-len/database")>("@len-len/database");
  return { ...actual, prisma: { organization: { updateMany } } };
});

const { suspendExpiredGracePeriods } = await import("../../src/modules/billing/grace.js");

// vitest.config.ts setzt BILLING_GRACE_PERIOD_DAYS nicht -> Default 7 greift.
const GRACE_DAYS = 7;
const NOW = new Date("2026-07-15T12:00:00.000Z");

interface UpdateArgs {
  where: {
    subscriptionStatus: string;
    pastDueSince: { not: null; lte: Date };
  };
  data: { subscriptionStatus: string };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("suspendExpiredGracePeriods (Regel 8)", () => {
  it("suspendiert genau die Tenants mit aufgebrauchter Karenzzeit", async () => {
    await suspendExpiredGracePeriods(NOW);

    const [args] = updateMany.mock.calls[0] as unknown as [UpdateArgs];
    expect(args.data).toEqual({ subscriptionStatus: "SUSPENDED" });

    // Cutoff = jetzt - 7 Tage: wer seit da oder länger säumig ist, fliegt raus.
    expect(args.where.pastDueSince.lte.toISOString()).toBe("2026-07-08T12:00:00.000Z");
    expect(args.where.pastDueSince.not).toBeNull();
  });

  it("fasst NUR PAST_DUE an", async () => {
    // Wer wieder bezahlt hat (ACTIVE) oder schon gekündigt ist (CANCELED), darf
    // vom Lauf nicht mehr getroffen werden.
    await suspendExpiredGracePeriods(NOW);
    const [args] = updateMany.mock.calls[0] as unknown as [UpdateArgs];
    expect(args.where.subscriptionStatus).toBe("PAST_DUE");
  });

  it("liefert die Anzahl der suspendierten Tenants", async () => {
    expect(await suspendExpiredGracePeriods(NOW)).toBe(2);
  });

  it("verschiebt den Cutoff mit der Uhr", async () => {
    await suspendExpiredGracePeriods(new Date("2026-08-01T00:00:00.000Z"));
    const [args] = updateMany.mock.calls[0] as unknown as [UpdateArgs];
    const expected = new Date(
      new Date("2026-08-01T00:00:00.000Z").getTime() - GRACE_DAYS * 86_400_000,
    );
    expect(args.where.pastDueSince.lte.toISOString()).toBe(expected.toISOString());
  });
});
