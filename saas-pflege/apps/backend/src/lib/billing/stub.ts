import type {
  BillingEvent,
  BillingProvider,
  CheckoutParams,
  CheckoutSession,
  PlanChangeParams,
  PortalParams,
  RecurringRevenue,
  SubscriptionState,
} from "./types.js";

// Stub für Dev/Test ohne Stripe-Keys. KEINE Signaturprüfung (Body = JSON).
export class StubBillingProvider implements BillingProvider {
  readonly name = "stub";

  async createCheckoutSession(params: CheckoutParams): Promise<CheckoutSession> {
    return {
      id: `cs_stub_${Date.now()}`,
      url: `https://stub.local/checkout?plan=${params.plan}&org=${params.organizationId}`,
    };
  }

  async createPortalSession(params: PortalParams): Promise<{ url: string }> {
    return { url: `https://stub.local/portal?customer=${params.customerId}` };
  }

  // Ohne Stripe gibt es kein Abo zu ändern. Den Tenant-Plan schreibt der
  // Service, damit Dev/Test denselben Ablauf durchlaufen wie Produktion.
  async changeSubscriptionPlan(_params: PlanChangeParams): Promise<void> {}

  // Ohne Stripe existiert kein Abo, dessen Zustand sich abfragen ließe. null ist
  // die ehrliche Antwort: Dev/Test laufen damit über den Checkout-Zweig. Hier
  // "läuft noch" zu behaupten hieße, einen Plan zu erfinden.
  async getSubscriptionState(_subscriptionId: string): Promise<SubscriptionState | null> {
    return null;
  }

  constructEvent(payload: Buffer): BillingEvent {
    return JSON.parse(payload.toString("utf8")) as BillingEvent;
  }

  // Ohne Stripe gibt es keine Abos und damit keinen Umsatz. Null zurückgeben,
  // nicht eine erfundene Zahl: das Panel zeigt in Dev sonst einen Betrag an,
  // den niemand zuordnen kann.
  async getRecurringRevenue(): Promise<RecurringRevenue> {
    return { amountCents: 0, currency: "eur", subscriptions: 0, truncated: false };
  }
}
