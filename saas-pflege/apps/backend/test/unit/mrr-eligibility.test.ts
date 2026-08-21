import { describe, it, expect, vi } from "vitest";
import type Stripe from "stripe";
import { StripeBillingProvider } from "../../src/lib/billing/stripe.js";

/**
 * Was in den Monatsumsatz zählt.
 *
 * Zwei Fehler, die im Panel sichtbar wurden und dieselbe Ursache haben: der
 * Umsatz kam allein von Stripe, und Stripe kennt weder unsere Status noch
 * unsere Löschungen.
 *
 *   1. Organisationen in der TESTPHASE erschienen im Umsatz. Sie zahlen nichts.
 *   2. Eine im Panel gelöschte Organisation blieb im Umsatz, weil die Löschung
 *      ihr Stripe-Abo nicht kündigt.
 *
 * Beide Filter werden hier festgehalten – der eine über die Abfrage an Stripe
 * (nur `active`), der andere über die Liste zählbarer Abos.
 */

const PRICE_MONTHLY = { unit_amount: 4900, currency: "eur", recurring: { interval: "month" } };

/** Stripe-Doppel: liefert die übergebenen Abos, gefiltert nach status. */
function stripeWith(subscriptions: { id: string; status: string }[]) {
  const list = vi.fn(async ({ status }: { status: string }) => ({
    data: subscriptions
      .filter((s) => s.status === status)
      .map((s) => ({ id: s.id, items: { data: [{ price: PRICE_MONTHLY, quantity: 1 }] } })),
    has_more: false,
  }));

  return { fake: { subscriptions: { list } } as unknown as Stripe, list };
}

function provider(subscriptions: { id: string; status: string }[]) {
  const { fake, list } = stripeWith(subscriptions);
  return { billing: new StripeBillingProvider(fake, "whsec_test"), list };
}

describe("getRecurringRevenue", () => {
  it("compte un abonnement actif et éligible", async () => {
    const { billing } = provider([{ id: "sub_a", status: "active" }]);

    const revenue = await billing.getRecurringRevenue(new Set(["sub_a"]));

    expect(revenue.amountCents).toBe(4900);
    expect(revenue.subscriptions).toBe(1);
  });

  it("n'interroge jamais Stripe avec le statut trialing", async () => {
    // Bug 1. Une organisation en période d'essai ne paie rien ; l'inclure
    // affichait un revenu que personne n'a versé.
    const { billing, list } = provider([
      { id: "sub_actif", status: "active" },
      { id: "sub_essai", status: "trialing" },
    ]);

    const revenue = await billing.getRecurringRevenue(new Set(["sub_actif", "sub_essai"]));

    expect(revenue.amountCents).toBe(4900);
    expect(revenue.subscriptions).toBe(1);
    for (const call of list.mock.calls) {
      expect((call[0] as { status: string }).status).not.toBe("trialing");
    }
  });

  it("ignore un abonnement dont l'organisation est supprimée", async () => {
    // Bug 2. La suppression douce ne résilie pas l'abonnement chez Stripe :
    // sans la liste des éligibles, il continuait d'alimenter le total.
    const { billing } = provider([
      { id: "sub_vivant", status: "active" },
      { id: "sub_org_supprimee", status: "active" },
    ]);

    const revenue = await billing.getRecurringRevenue(new Set(["sub_vivant"]));

    expect(revenue.amountCents).toBe(4900);
    expect(revenue.subscriptions).toBe(1);
  });

  it("rend zéro quand aucun abonnement n'est éligible, sans appeler Stripe", async () => {
    // Une liste vide veut dire « rien à compter », surtout pas « tout compter ».
    const { billing, list } = provider([{ id: "sub_a", status: "active" }]);

    const revenue = await billing.getRecurringRevenue(new Set());

    expect(revenue.amountCents).toBe(0);
    expect(revenue.subscriptions).toBe(0);
    expect(list).not.toHaveBeenCalled();
  });

  it("laisse de côté les abonnements en impayé", async () => {
    // past_due n'encaisse peut-être plus rien ; le compter embellirait le
    // tableau de bord.
    const { billing } = provider([
      { id: "sub_a", status: "active" },
      { id: "sub_impaye", status: "past_due" },
    ]);

    const revenue = await billing.getRecurringRevenue(new Set(["sub_a", "sub_impaye"]));

    expect(revenue.subscriptions).toBe(1);
  });

  it("additionne plusieurs abonnements éligibles", async () => {
    const { billing } = provider([
      { id: "sub_a", status: "active" },
      { id: "sub_b", status: "active" },
    ]);

    const revenue = await billing.getRecurringRevenue(new Set(["sub_a", "sub_b"]));

    expect(revenue.amountCents).toBe(9800);
    expect(revenue.subscriptions).toBe(2);
  });
});
