import { describe, it, expect, vi } from "vitest";
import { StripeBillingProvider } from "../../src/lib/billing/stripe.js";

/**
 * Was an die Stripe-Checkout-API geht. Geprüft wird die Nutzlast, nicht Stripe
 * selbst: die beiden Fehler, die hier teuer wären, sind ein zweiter Customer
 * für denselben Tenant und ein Abo ohne Zuordnung zur Organisation.
 */
function fakeStripe(capture: { args?: Record<string, unknown> }) {
  return {
    checkout: {
      sessions: {
        create: vi.fn(async (args: Record<string, unknown>) => {
          capture.args = args;
          return { id: "cs_test_1", url: "https://checkout.stripe.test/cs_test_1" };
        }),
      },
    },
    billingPortal: { sessions: { create: vi.fn() } },
    webhooks: { constructEvent: vi.fn() },
  } as unknown as ConstructorParameters<typeof StripeBillingProvider>[0];
}

const BASE = {
  organizationId: "org-1",
  plan: "BASIC",
  successUrl: "https://app.test/de/billing?checkout=success",
  cancelUrl: "https://app.test/de/billing?checkout=cancel",
};

describe("StripeBillingProvider.createCheckoutSession", () => {
  it("übergibt den bestehenden Customer und KEINE E-Mail", async () => {
    const capture: { args?: Record<string, unknown> } = {};
    const provider = new StripeBillingProvider(fakeStripe(capture), "whsec_test");

    await provider.createCheckoutSession({
      ...BASE,
      customerId: "cus_existing",
      customerEmail: "admin@demo.de",
    });

    // Stripe lehnt customer und customer_email gemeinsam ab.
    expect(capture.args?.customer).toBe("cus_existing");
    expect(capture.args?.customer_email).toBeUndefined();
  });

  it("übergibt die E-Mail, solange kein Customer existiert", async () => {
    const capture: { args?: Record<string, unknown> } = {};
    const provider = new StripeBillingProvider(fakeStripe(capture), "whsec_test");

    await provider.createCheckoutSession({ ...BASE, customerEmail: "admin@demo.de" });

    expect(capture.args?.customer).toBeUndefined();
    expect(capture.args?.customer_email).toBe("admin@demo.de");
  });

  it("hinterlegt die Organisation an der Session UND am Abo", async () => {
    const capture: { args?: Record<string, unknown> } = {};
    const provider = new StripeBillingProvider(fakeStripe(capture), "whsec_test");

    await provider.createCheckoutSession(BASE);

    expect(capture.args?.metadata).toEqual({ organizationId: "org-1", plan: "BASIC" });
    // Ohne die Metadaten am Abo wäre ein customer.subscription.created, das vor
    // checkout.session.completed eintrifft, keinem Tenant zuzuordnen.
    expect(capture.args?.subscription_data).toEqual({
      metadata: { organizationId: "org-1", plan: "BASIC" },
    });
  });

  it("wählt den Abo-Modus und den Preis des Plans", async () => {
    const capture: { args?: Record<string, unknown> } = {};
    const provider = new StripeBillingProvider(fakeStripe(capture), "whsec_test");

    await provider.createCheckoutSession(BASE);

    expect(capture.args?.mode).toBe("subscription");
    expect(capture.args?.line_items).toEqual([{ price: "price_test_basic", quantity: 1 }]);
  });

  it("scheitert verständlich, wenn für den Plan kein Preis hinterlegt ist", async () => {
    const capture: { args?: Record<string, unknown> } = {};
    const provider = new StripeBillingProvider(fakeStripe(capture), "whsec_test");

    await expect(provider.createCheckoutSession({ ...BASE, plan: "ENTERPRISE" })).rejects.toThrow(
      /Kein Stripe-Preis/,
    );
  });
});
