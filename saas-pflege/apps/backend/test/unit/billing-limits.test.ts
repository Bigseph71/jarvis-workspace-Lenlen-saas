import { describe, it, expect } from "vitest";
import type { Prisma, SubscriptionPlan, SubscriptionStatus } from "@len-len/database";
import type { TenantTx } from "../../src/lib/context.js";
import { AppError } from "../../src/lib/errors.js";
import { assertWithinPlan } from "../../src/modules/billing/limits.js";

interface FakeOrg {
  subscriptionPlan: SubscriptionPlan;
  subscriptionStatus: SubscriptionStatus;
  planLimits: Prisma.JsonValue;
}

/**
 * Minimales Transaktions-Doppel: assertWithinPlan nutzt vom `tx` nur den
 * Organisations-Lookup und je einen Zähler – mehr braucht der Test nicht.
 */
function fakeTx(
  org: FakeOrg | null,
  counts: { patients?: number; caregivers?: number; vehicles?: number } = {},
): TenantTx {
  return {
    organization: { findFirst: async () => org },
    patient: { count: async () => counts.patients ?? 0 },
    caregiver: { count: async () => counts.caregivers ?? 0 },
    vehicle: { count: async () => counts.vehicles ?? 0 },
  } as unknown as TenantTx;
}

function org(
  plan: string,
  status: string,
  planLimits: Prisma.JsonValue = {},
): FakeOrg {
  return {
    subscriptionPlan: plan as SubscriptionPlan,
    subscriptionStatus: status as SubscriptionStatus,
    planLimits,
  };
}

/** Fängt den erwarteten AppError ein, statt nur auf "wirft" zu prüfen. */
async function catchError(fn: () => Promise<unknown>): Promise<AppError> {
  try {
    await fn();
  } catch (err) {
    if (err instanceof AppError) return err;
    throw err;
  }
  throw new Error("Erwarteter AppError wurde nicht geworfen");
}

describe("assertWithinPlan – Plan-Limits (HTTP 402)", () => {
  it("lässt durch, solange das Limit nicht erreicht ist", async () => {
    const tx = fakeTx(org("BASIC", "ACTIVE"), { patients: 99 });
    await expect(assertWithinPlan(tx, "org-1", "patients")).resolves.toBeUndefined();
  });

  it("blockiert mit 402, sobald das Limit erreicht ist", async () => {
    // 100 vorhandene Patienten + der neue = 101 > Basic-Limit 100.
    const tx = fakeTx(org("BASIC", "ACTIVE"), { patients: 100 });
    const err = await catchError(() => assertWithinPlan(tx, "org-1", "patients"));
    expect(err.statusCode).toBe(402);
    expect(err.code).toBe("PaymentRequired");
    expect(err.message).toContain("100");
  });

  it("greift je Ressource getrennt", async () => {
    const tx = fakeTx(org("BASIC", "ACTIVE"), { patients: 0, caregivers: 10 });
    await expect(assertWithinPlan(tx, "org-1", "patients")).resolves.toBeUndefined();
    expect((await catchError(() => assertWithinPlan(tx, "org-1", "caregivers"))).statusCode).toBe(402);
  });

  it("lässt unbegrenzte Ressourcen immer durch (Enterprise-Fahrzeuge)", async () => {
    const tx = fakeTx(org("ENTERPRISE", "ACTIVE"), { vehicles: 9999 });
    await expect(assertWithinPlan(tx, "org-1", "vehicles")).resolves.toBeUndefined();
  });

  it("berücksichtigt ausgehandelte Overrides aus planLimits", async () => {
    const tx = fakeTx(org("BASIC", "ACTIVE", { patients: 250 }), { patients: 150 });
    await expect(assertWithinPlan(tx, "org-1", "patients")).resolves.toBeUndefined();

    const atLimit = fakeTx(org("BASIC", "ACTIVE", { patients: 250 }), { patients: 250 });
    expect((await catchError(() => assertWithinPlan(atLimit, "org-1", "patients"))).statusCode).toBe(402);
  });
});

describe("assertWithinPlan – Abo-Status (Regel 8)", () => {
  it("blockiert einen suspendierten Tenant mit 402", async () => {
    const tx = fakeTx(org("PRO", "SUSPENDED"), { patients: 0 });
    const err = await catchError(() => assertWithinPlan(tx, "org-1", "patients"));
    expect(err.statusCode).toBe(402);
    expect(err.message).toContain("Abonnement");
  });

  it("blockiert einen gekündigten Tenant mit 402", async () => {
    const tx = fakeTx(org("PRO", "CANCELED"), { patients: 0 });
    expect((await catchError(() => assertWithinPlan(tx, "org-1", "patients"))).statusCode).toBe(402);
  });

  it("lässt PAST_DUE weiterarbeiten – die Karenzzeit läuft noch", async () => {
    const tx = fakeTx(org("PRO", "PAST_DUE"), { patients: 5 });
    await expect(assertWithinPlan(tx, "org-1", "patients")).resolves.toBeUndefined();
  });

  it("greift auch bei PAST_DUE weiterhin auf das Limit", async () => {
    const tx = fakeTx(org("BASIC", "PAST_DUE"), { patients: 100 });
    expect((await catchError(() => assertWithinPlan(tx, "org-1", "patients"))).statusCode).toBe(402);
  });

  it("meldet 404 für eine unbekannte Organisation", async () => {
    const err = await catchError(() => assertWithinPlan(fakeTx(null), "org-weg", "patients"));
    expect(err.statusCode).toBe(404);
  });
});
