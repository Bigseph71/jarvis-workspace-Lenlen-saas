import { describe, it, expect, afterEach, vi } from "vitest";

/**
 * Auswahl des Billing-Providers.
 *
 * Der Kern: der Stub prüft KEINE Signatur (er parst schlicht das JSON). In
 * Produktion wäre er damit ein offenes Scheunentor auf /billing/webhook –
 * jeder könnte den Plan eines fremden Tenants setzen oder dessen Abo kündigen.
 * Ein leeres STRIPE_SECRET_KEY muss deshalb scheitern statt still
 * zurückzufallen.
 */

const ORIGINAL = { ...process.env };

async function loadBilling(overrides: Record<string, string | undefined>) {
  vi.resetModules();
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  return import("../../src/lib/billing/index.js");
}

afterEach(() => {
  process.env = { ...ORIGINAL };
  vi.resetModules();
});

describe("getBillingProvider", () => {
  it("nimmt in der Entwicklung den Stub, wenn keine Keys gesetzt sind", async () => {
    const billing = await loadBilling({
      NODE_ENV: "development",
      STRIPE_SECRET_KEY: undefined,
      STRIPE_WEBHOOK_SECRET: undefined,
    });
    expect(billing.stripeConfigured()).toBe(false);
    expect(billing.getBillingProvider().name).toBe("stub");
  });

  it("verweigert den Start in Produktion ohne Stripe-Keys", async () => {
    const billing = await loadBilling({
      NODE_ENV: "production",
      STRIPE_SECRET_KEY: undefined,
      STRIPE_WEBHOOK_SECRET: undefined,
    });
    expect(() => billing.getBillingProvider()).toThrowError(/Produktion|unsignierte/);
  });

  it("verweigert den Start auch bei nur halb gesetzter Konfiguration", async () => {
    const billing = await loadBilling({
      NODE_ENV: "production",
      STRIPE_SECRET_KEY: "sk_test_halb",
      STRIPE_WEBHOOK_SECRET: undefined,
    });
    expect(billing.stripeConfigured()).toBe(false);
    expect(() => billing.getBillingProvider()).toThrow();
  });

  it("nimmt Stripe, sobald beide Keys da sind", async () => {
    const billing = await loadBilling({
      NODE_ENV: "production",
      STRIPE_SECRET_KEY: "sk_test_vollstaendig",
      STRIPE_WEBHOOK_SECRET: "whsec_test",
    });
    expect(billing.stripeConfigured()).toBe(true);
    expect(billing.getBillingProvider().name).toBe("stripe");
  });
});

describe("StubBillingProvider", () => {
  it("prüft keine Signatur – genau deshalb ist er in Produktion verboten", async () => {
    const { StubBillingProvider } = await import("../../src/lib/billing/stub.js");
    const stub = new StubBillingProvider();
    const forged = Buffer.from(
      JSON.stringify({ id: "evt_forged", type: "customer.subscription.deleted", data: { object: {} } }),
    );
    // Ohne Signatur, ohne Secret: der Stub nimmt es an.
    expect(stub.constructEvent(forged).type).toBe("customer.subscription.deleted");
  });
});
