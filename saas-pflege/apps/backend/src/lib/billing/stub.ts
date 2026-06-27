import type { BillingEvent, BillingProvider, CheckoutParams, CheckoutSession } from "./types.js";

// Stub für Dev/Test ohne Stripe-Keys. KEINE Signaturprüfung (Body = JSON).
export class StubBillingProvider implements BillingProvider {
  readonly name = "stub";

  async createCheckoutSession(params: CheckoutParams): Promise<CheckoutSession> {
    return {
      id: `cs_stub_${Date.now()}`,
      url: `https://stub.local/checkout?plan=${params.plan}&org=${params.organizationId}`,
    };
  }

  constructEvent(payload: Buffer): BillingEvent {
    return JSON.parse(payload.toString("utf8")) as BillingEvent;
  }
}
