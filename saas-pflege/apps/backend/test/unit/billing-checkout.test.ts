import { describe, it, expect, vi } from "vitest";
import Stripe from "stripe";
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

  it("meldet den fehlenden Preis als 503 samt Variablenname", async () => {
    const capture: { args?: Record<string, unknown> } = {};
    const provider = new StripeBillingProvider(fakeStripe(capture), "whsec_test");

    // 503 statt 500: der Dienst ist gesund, es fehlt nur Konfiguration. Und der
    // Variablenname erspart es, den Fehler im Checkout nachzustellen, um zu
    // erfahren, was zu setzen ist.
    await expect(
      provider.createCheckoutSession({ ...BASE, plan: "ENTERPRISE" }),
    ).rejects.toMatchObject({
      statusCode: 503,
      code: "BillingNotConfigured",
      message: expect.stringContaining("STRIPE_PRICE_ENTERPRISE"),
    });
  });
});

/**
 * Planwechsel am BESTEHENDEN Abo.
 *
 * Der teure Fehler ist hier ein zweiter Checkout: Stripe erlaubt beliebig viele
 * Abos je Customer, das alte liefe weiter und der Tenant zahlte doppelt. Diese
 * Tests halten fest, dass gewechselt und nicht neu abgeschlossen wird.
 */
function fakeStripeWithSubscription(
  items: { id: string; price: { id: string } }[],
  capture: { update?: [string, Record<string, unknown>] },
  status = "active",
) {
  const checkoutCreate = vi.fn();
  const stripe = {
    checkout: { sessions: { create: checkoutCreate } },
    billingPortal: { sessions: { create: vi.fn() } },
    webhooks: { constructEvent: vi.fn() },
    subscriptions: {
      retrieve: vi.fn(async () => ({ status, items: { data: items } })),
      update: vi.fn(async (id: string, args: Record<string, unknown>) => {
        capture.update = [id, args];
        return {};
      }),
    },
  };
  return {
    stripe: stripe as unknown as ConstructorParameters<typeof StripeBillingProvider>[0],
    checkoutCreate,
    update: stripe.subscriptions.update,
  };
}

const CHANGE = { organizationId: "org-1", subscriptionId: "sub_123", plan: "PRO" };

describe("StripeBillingProvider.changeSubscriptionPlan", () => {
  it("tauscht den Preis der bestehenden Position aus, statt eine zweite anzulegen", async () => {
    const capture: { update?: [string, Record<string, unknown>] } = {};
    const { stripe } = fakeStripeWithSubscription(
      [{ id: "si_1", price: { id: "price_test_basic" } }],
      capture,
    );

    await new StripeBillingProvider(stripe, "whsec_test").changeSubscriptionPlan(CHANGE);

    expect(capture.update?.[0]).toBe("sub_123");
    // Die Position wird über ihre ID ERSETZT. Ohne die id hängte Stripe eine
    // zweite Position an und berechnete beide Pläne.
    expect(capture.update?.[1].items).toEqual([
      { id: "si_1", price: "price_test_pro", quantity: 1 },
    ]);
    expect(capture.update?.[1].proration_behavior).toBe("create_prorations");
  });

  it("legt dabei KEINEN zweiten Checkout an", async () => {
    const capture: { update?: [string, Record<string, unknown>] } = {};
    const { stripe, checkoutCreate } = fakeStripeWithSubscription(
      [{ id: "si_1", price: { id: "price_test_basic" } }],
      capture,
    );

    await new StripeBillingProvider(stripe, "whsec_test").changeSubscriptionPlan(CHANGE);

    expect(checkoutCreate).not.toHaveBeenCalled();
  });

  it("führt die Organisation am Abo mit, damit der Webhook sie zuordnen kann", async () => {
    const capture: { update?: [string, Record<string, unknown>] } = {};
    const { stripe } = fakeStripeWithSubscription(
      [{ id: "si_1", price: { id: "price_test_basic" } }],
      capture,
    );

    await new StripeBillingProvider(stripe, "whsec_test").changeSubscriptionPlan(CHANGE);

    expect(capture.update?.[1].metadata).toEqual({ organizationId: "org-1", plan: "PRO" });
  });

  it("tut nichts, wenn das Abo schon auf dem Zielpreis läuft (Doppelklick)", async () => {
    const capture: { update?: [string, Record<string, unknown>] } = {};
    const { stripe, update } = fakeStripeWithSubscription(
      [{ id: "si_1", price: { id: "price_test_pro" } }],
      capture,
    );

    await new StripeBillingProvider(stripe, "whsec_test").changeSubscriptionPlan(CHANGE);

    expect(update).not.toHaveBeenCalled();
  });

  it("rührt ein Abo mit mehreren Positionen nicht an", async () => {
    const capture: { update?: [string, Record<string, unknown>] } = {};
    const { stripe, update } = fakeStripeWithSubscription(
      [
        { id: "si_1", price: { id: "price_test_basic" } },
        { id: "si_2", price: { id: "price_zusatz" } },
      ],
      capture,
    );

    // Blind die erste Position zu ersetzen könnte einen ausgehandelten
    // Zusatzposten löschen – lieber scheitern und den Menschen entscheiden lassen.
    await expect(
      new StripeBillingProvider(stripe, "whsec_test").changeSubscriptionPlan(CHANGE),
    ).rejects.toThrow(/mehrere Positionen/);
    expect(update).not.toHaveBeenCalled();
  });

  it("scheitert verständlich, wenn für den Zielplan kein Preis hinterlegt ist", async () => {
    const capture: { update?: [string, Record<string, unknown>] } = {};
    const { stripe } = fakeStripeWithSubscription(
      [{ id: "si_1", price: { id: "price_test_basic" } }],
      capture,
    );

    await expect(
      new StripeBillingProvider(stripe, "whsec_test").changeSubscriptionPlan({
        ...CHANGE,
        plan: "ENTERPRISE",
      }),
    ).rejects.toThrow(/Kein Stripe-Preis/);
  });
});

/**
 * Der Zustand, den NUR Stripe kennt.
 *
 * Der teure Fall ist `unpaid`: unser eigener Status sagt dazu SUSPENDED, genau
 * wie zu `incomplete_expired`. Wer danach entscheidet, schickt einen Tenant mit
 * lebendem Abo in einen zweiten Checkout und belastet ihn doppelt. Ob Stripe ein
 * `unpaid`-Abo stattdessen kündigt, hängt an einer Dashboard-Einstellung – auf
 * die verlassen wir uns nicht.
 */
describe("StripeBillingProvider.getSubscriptionState", () => {
  const stateFor = async (status: string, priceId = "price_test_basic") => {
    const capture: { update?: [string, Record<string, unknown>] } = {};
    const { stripe } = fakeStripeWithSubscription(
      [{ id: "si_1", price: { id: priceId } }],
      capture,
      status,
    );
    return new StripeBillingProvider(stripe, "whsec_test").getSubscriptionState("sub_123");
  };

  it.each(["active", "trialing", "past_due", "unpaid", "paused"])(
    "hält ein Abo im Status %s für laufend (Checkout wäre Doppelbelastung)",
    async (status) => {
      expect((await stateFor(status))?.live).toBe(true);
    },
  );

  it.each(["canceled", "incomplete_expired", "incomplete"])(
    "hält ein Abo im Status %s für beendet (Neuabschluss ist richtig)",
    async (status) => {
      expect((await stateFor(status))?.live).toBe(false);
    },
  );

  it("liefert den Plan hinter dem gebuchten Preis mit", async () => {
    expect(await stateFor("unpaid", "price_test_pro")).toEqual({
      status: "unpaid",
      live: true,
      plan: "PRO",
    });
  });

  it("liefert plan=null bei einem Sonderpreis", async () => {
    // Der Aufrufer bricht dann ab, statt die ausgehandelte Kondition durch den
    // Katalogpreis zu ersetzen.
    expect((await stateFor("active", "price_deal_2024"))?.plan).toBeNull();
  });

  it("liefert plan=null bei mehreren Positionen", async () => {
    const capture: { update?: [string, Record<string, unknown>] } = {};
    const { stripe } = fakeStripeWithSubscription(
      [
        { id: "si_1", price: { id: "price_test_basic" } },
        { id: "si_2", price: { id: "price_zusatz" } },
      ],
      capture,
    );

    expect(
      (await new StripeBillingProvider(stripe, "whsec_test").getSubscriptionState("sub_123"))?.plan,
    ).toBeNull();
  });

  it("liefert null, wenn die gespeicherte Abo-ID bei Stripe ins Leere zeigt", async () => {
    // Sonst bliebe ein Tenant mit veralteter ID (z.B. noch aus dem Testmodus)
    // dauerhaft am Abschluss gehindert.
    const missing = new Stripe.errors.StripeInvalidRequestError({
      type: "invalid_request_error",
      code: "resource_missing",
      message: "No such subscription: sub_alt",
    });
    const stripe = {
      checkout: { sessions: { create: vi.fn() } },
      billingPortal: { sessions: { create: vi.fn() } },
      webhooks: { constructEvent: vi.fn() },
      subscriptions: {
        retrieve: vi.fn(async () => {
          throw missing;
        }),
        update: vi.fn(),
      },
    } as unknown as ConstructorParameters<typeof StripeBillingProvider>[0];

    expect(
      await new StripeBillingProvider(stripe, "whsec_test").getSubscriptionState("sub_alt"),
    ).toBeNull();
  });

  it("reicht andere Stripe-Fehler weiter, statt sie als 'kein Abo' zu deuten", async () => {
    // Bei Netzproblem oder falschem Key wissen wir nichts. Ein Checkout auf
    // Verdacht wäre genau die Doppelbelastung, die hier verhindert wird.
    const stripe = {
      checkout: { sessions: { create: vi.fn() } },
      billingPortal: { sessions: { create: vi.fn() } },
      webhooks: { constructEvent: vi.fn() },
      subscriptions: {
        retrieve: vi.fn(async () => {
          throw new Error("connection refused");
        }),
        update: vi.fn(),
      },
    } as unknown as ConstructorParameters<typeof StripeBillingProvider>[0];

    await expect(
      new StripeBillingProvider(stripe, "whsec_test").getSubscriptionState("sub_123"),
    ).rejects.toThrow(/connection refused/);
  });
});
