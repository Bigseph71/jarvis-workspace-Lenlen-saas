import { describe, it, expect } from "vitest";
import type { SubscriptionPlan } from "@len-len/database";
import { resolvePlanLimits } from "../../src/modules/billing/plan.js";
import { mapSubscriptionStatus } from "../../src/modules/billing/events.js";
import { StubBillingProvider } from "../../src/lib/billing/stub.js";

const BASIC = "BASIC" as SubscriptionPlan;
const PRO = "PRO" as SubscriptionPlan;

describe("resolvePlanLimits (override planLimits)", () => {
  it("liefert die Plan-Defaults ohne Override", () => {
    expect(resolvePlanLimits(BASIC, null)).toMatchObject({ patients: 100, caregivers: 10, vehicles: 5 });
    expect(resolvePlanLimits(BASIC, {})).toMatchObject({ patients: 100, caregivers: 10, vehicles: 5 });
  });

  it("überschreibt einzelne Limits per JSON", () => {
    const limits = resolvePlanLimits(BASIC, { patients: 250 });
    expect(limits.patients).toBe(250);
    expect(limits.caregivers).toBe(10); // Default bleibt
  });

  it("erlaubt explizit unbegrenzte Fahrzeuge (null)", () => {
    expect(resolvePlanLimits(BASIC, { vehicles: null }).vehicles).toBeNull();
  });

  it("ignoriert ungültige Werte und Nicht-Objekte", () => {
    expect(resolvePlanLimits(PRO, { patients: -5, caregivers: "viele" })).toMatchObject({
      patients: 1000,
      caregivers: 100,
    });
    expect(resolvePlanLimits(BASIC, [1, 2, 3])).toMatchObject({ patients: 100 });
  });
});

describe("mapSubscriptionStatus (Suspendierung, Regel 8)", () => {
  it("aktiviert bei active/trialing", () => {
    expect(mapSubscriptionStatus("active")).toBe("ACTIVE");
    expect(mapSubscriptionStatus("trialing")).toBe("ACTIVE");
  });

  it("PAST_DUE in der Karenzzeit, SUSPENDED bei unpaid", () => {
    expect(mapSubscriptionStatus("past_due")).toBe("PAST_DUE");
    expect(mapSubscriptionStatus("unpaid")).toBe("SUSPENDED");
    expect(mapSubscriptionStatus("paused")).toBe("SUSPENDED");
    expect(mapSubscriptionStatus("incomplete_expired")).toBe("SUSPENDED");
  });

  it("CANCELED bei canceled, ignoriert unbekannte/incomplete", () => {
    expect(mapSubscriptionStatus("canceled")).toBe("CANCELED");
    expect(mapSubscriptionStatus("incomplete")).toBeNull();
    expect(mapSubscriptionStatus("egal")).toBeNull();
  });
});

describe("StubBillingProvider.createPortalSession", () => {
  it("liefert eine Stub-Portal-URL mit der Customer-ID", async () => {
    const session = await new StubBillingProvider().createPortalSession({
      customerId: "cus_123",
      returnUrl: "https://app.local/billing",
    });
    expect(session.url).toContain("customer=cus_123");
  });
});
