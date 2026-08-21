import { describe, it, expect, vi } from "vitest";
import Stripe from "stripe";
import { StripeBillingProvider } from "../../src/lib/billing/stripe.js";

/**
 * Kündigung des Abos beim Löschen einer Organisation.
 *
 * Ohne sie verschwand der Kunde aus dem Panel und wurde weiter abgebucht – und
 * seit der Monatsumsatz gelöschte Organisationen ausblendet, fiel es niemandem
 * mehr auf. Die Kündigung ist deshalb sofort und nicht zum Periodenende.
 */

function stripeDouble(behaviour: (id: string) => unknown) {
  const cancel = vi.fn(async (id: string, params?: unknown) => {
    const result = behaviour(id);
    if (result instanceof Error) throw result;
    return { id, status: "canceled", params };
  });
  return {
    provider: new StripeBillingProvider(
      { subscriptions: { cancel } } as unknown as Stripe,
      "whsec_test",
    ),
    cancel,
  };
}

/** Fehler, wie Stripe ihn für ein unbekanntes Abo liefert. */
function missingError(): Stripe.errors.StripeInvalidRequestError {
  return new Stripe.errors.StripeInvalidRequestError({
    type: "invalid_request_error",
    code: "resource_missing",
    message: "No such subscription: sub_weg",
  });
}

describe("cancelSubscription", () => {
  it("beendet das Abo sofort", async () => {
    const { provider, cancel } = stripeDouble(() => undefined);

    const result = await provider.cancelSubscription("sub_1");

    expect(result).toEqual({ canceled: true, alreadyGone: false });
    expect(cancel).toHaveBeenCalledWith("sub_1", expect.anything());
  });

  it("hinterlegt den Löschgrund beim Anbieter", async () => {
    // Damit die Abrechnungshistorie dort dieselbe Geschichte erzählt wie unser
    // Audit-Log.
    const { provider, cancel } = stripeDouble(() => undefined);

    await provider.cancelSubscription("sub_1", "Vertrag zum Monatsende gekündigt");

    const [, params] = cancel.mock.calls[0] as [string, { cancellation_details?: { comment?: string } }];
    expect(params.cancellation_details?.comment).toBe("Vertrag zum Monatsende gekündigt");
  });

  it("kürzt einen überlangen Grund, statt am Anbieter zu scheitern", async () => {
    const { provider, cancel } = stripeDouble(() => undefined);

    await provider.cancelSubscription("sub_1", "x".repeat(900));

    const [, params] = cancel.mock.calls[0] as [string, { cancellation_details?: { comment?: string } }];
    expect(params.cancellation_details?.comment?.length).toBe(500);
  });

  it("nimmt ein unbekanntes Abo hin", async () => {
    // Zweite Löschung desselben Tenants, oder eine ID aus dem Testmodus. Kein
    // Fehler: das Ziel – kein laufendes Abo – ist erreicht.
    const { provider } = stripeDouble(() => missingError());

    const result = await provider.cancelSubscription("sub_weg");

    expect(result).toEqual({ canceled: true, alreadyGone: true });
  });

  it("reicht einen echten Fehler weiter", async () => {
    // Netzproblem, falscher Schlüssel, Rate Limit: hier wüssten wir nichts.
    // Verschlucken hiesse, eine weiterlaufende Abbuchung als erledigt zu
    // melden.
    const { provider } = stripeDouble(() => new Error("connection reset"));

    await expect(provider.cancelSubscription("sub_1")).rejects.toThrow("connection reset");
  });

  it("übergibt kein cancel_at_period_end", async () => {
    // Der Parameter existiert an `cancel` nicht – er gehört zu `update`. Ihn
    // mitzugeben würde Stripe mit einem Validierungsfehler quittieren.
    const { provider, cancel } = stripeDouble(() => undefined);

    await provider.cancelSubscription("sub_1", "Grund");

    const [, params] = cancel.mock.calls[0] as [string, Record<string, unknown>];
    expect(params).not.toHaveProperty("cancel_at_period_end");
  });
});
