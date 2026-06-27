import { describe, it, expect } from "vitest";
import type { SubscriptionPlan } from "@len-len/database";
import { PLAN_LIMITS, limitFor, exceedsLimit, parsePlan } from "../../src/modules/billing/plan.js";
import { mapEventToStatus } from "../../src/modules/billing/events.js";
import { StubBillingProvider } from "../../src/lib/billing/stub.js";

const BASIC = "BASIC" as SubscriptionPlan;
const ENTERPRISE = "ENTERPRISE" as SubscriptionPlan;

describe("PLAN_LIMITS", () => {
  it("reflète les quotas du CLAUDE.md", () => {
    expect(PLAN_LIMITS.BASIC).toMatchObject({ patients: 100, caregivers: 10, vehicles: 5, ki: false });
    expect(PLAN_LIMITS.PRO).toMatchObject({ patients: 1000, caregivers: 100, vehicles: 30, ki: true });
    expect(PLAN_LIMITS.ENTERPRISE).toMatchObject({ patients: 5000, caregivers: 500, vehicles: null, ki: true });
  });

  it("limitFor renvoie null pour les véhicules Enterprise (illimité)", () => {
    expect(limitFor(BASIC, "vehicles")).toBe(5);
    expect(limitFor(ENTERPRISE, "vehicles")).toBeNull();
  });
});

describe("exceedsLimit (HTTP 402)", () => {
  it("dépasse quand le compteur atteint la limite", () => {
    expect(exceedsLimit(BASIC, "patients", 99)).toBe(false);
    expect(exceedsLimit(BASIC, "patients", 100)).toBe(true);
    expect(exceedsLimit(BASIC, "patients", 150)).toBe(true);
  });

  it("ne dépasse jamais une ressource illimitée", () => {
    expect(exceedsLimit(ENTERPRISE, "vehicles", 9999)).toBe(false);
  });
});

describe("parsePlan", () => {
  it("valide les plans connus, rejette le reste", () => {
    expect(parsePlan("PRO")).toBe("PRO");
    expect(parsePlan("GOLD")).toBeNull();
    expect(parsePlan(42)).toBeNull();
  });
});

describe("mapEventToStatus", () => {
  it("mappe les événements Stripe vers le statut d'abonnement", () => {
    expect(mapEventToStatus("checkout.session.completed")).toBe("ACTIVE");
    expect(mapEventToStatus("invoice.payment_succeeded")).toBe("ACTIVE");
    expect(mapEventToStatus("invoice.payment_failed")).toBe("PAST_DUE");
    expect(mapEventToStatus("customer.subscription.deleted")).toBe("CANCELED");
    expect(mapEventToStatus("unbekannt")).toBeNull();
  });
});

describe("StubBillingProvider", () => {
  const provider = new StubBillingProvider();

  it("crée une session de checkout factice contenant le plan", async () => {
    const session = await provider.createCheckoutSession({
      organizationId: "org-1",
      plan: "PRO",
      successUrl: "s",
      cancelUrl: "c",
    });
    expect(session.url).toContain("plan=PRO");
    expect(session.id).toMatch(/^cs_stub_/);
  });

  it("parse l'événement webhook depuis le body JSON (sans signature)", () => {
    const payload = Buffer.from(JSON.stringify({ type: "invoice.paid", data: { object: {} } }));
    const event = provider.constructEvent(payload, undefined);
    expect(event.type).toBe("invoice.paid");
  });
});
