import type {
  BillingEvent,
  BillingProvider,
  CheckoutParams,
  CheckoutSession,
  PortalParams,
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

  constructEvent(payload: Buffer): BillingEvent {
    return JSON.parse(payload.toString("utf8")) as BillingEvent;
  }
}
