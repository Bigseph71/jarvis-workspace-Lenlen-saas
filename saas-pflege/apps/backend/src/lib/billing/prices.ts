import { env } from "../../config/env.js";

const PRICE_BY_PLAN: Record<string, string | undefined> = {
  BASIC: env.STRIPE_PRICE_BASIC,
  PRO: env.STRIPE_PRICE_PRO,
  ENTERPRISE: env.STRIPE_PRICE_ENTERPRISE,
};

/** Stripe-Preis des Plans, oder undefined wenn nicht konfiguriert. */
export function priceForPlan(plan: string): string | undefined {
  return PRICE_BY_PLAN[plan];
}

/**
 * Namen der Preis-Variablen, die fehlen. Leer = jeder Plan des Katalogs ist
 * buchbar.
 *
 * Ein fehlender Preis fällt sonst erst auf, wenn ein Kunde den Plan anklickt:
 * die Keys sind vollständig, der Dienst startet, und der Fehler kommt als
 * nichtssagender 500 mitten im Kaufvorgang. Damit lässt sich das beim Start
 * melden, solange es noch billig ist.
 */
export function missingPriceEnvVars(): string[] {
  return Object.entries(PRICE_BY_PLAN)
    .filter(([, price]) => price === undefined)
    .map(([plan]) => `STRIPE_PRICE_${plan}`);
}

/**
 * Umgekehrter Weg: Stripe-Preis -> Plan. null, wenn der Preis zu keinem Plan
 * gehört (z.B. ein in Stripe von Hand angelegter Sonderpreis).
 *
 * Der Preis AM ABO ist die einzige verlässliche Quelle für den gebuchten Plan.
 * Die beim Checkout gesetzten Metadaten sind es nicht: wechselt ein Kunde den
 * Plan über das Stripe-Kundenportal, ändert Stripe den Preis, lässt die
 * Metadaten aber unangetastet. Wer den Plan von dort läse, schriebe nach jedem
 * Portal-Wechsel den alten Plan zurück.
 */
export function planForPrice(priceId: string): string | null {
  for (const [plan, price] of Object.entries(PRICE_BY_PLAN)) {
    if (price !== undefined && price === priceId) return plan;
  }
  return null;
}
