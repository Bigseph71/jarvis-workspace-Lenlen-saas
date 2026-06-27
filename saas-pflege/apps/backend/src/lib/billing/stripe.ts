import Stripe from "stripe";
import { env } from "../../config/env.js";
import type { BillingEvent, BillingProvider, CheckoutParams, CheckoutSession } from "./types.js";

const PRICE_BY_PLAN: Record<string, string | undefined> = {
  BASIC: env.STRIPE_PRICE_BASIC,
  PRO: env.STRIPE_PRICE_PRO,
  ENTERPRISE: env.STRIPE_PRICE_ENTERPRISE,
};

export class StripeBillingProvider implements BillingProvider {
  readonly name = "stripe";

  constructor(
    private readonly stripe: Stripe,
    private readonly webhookSecret: string,
  ) {}

  async createCheckoutSession(params: CheckoutParams): Promise<CheckoutSession> {
    const price = PRICE_BY_PLAN[params.plan];
    if (!price) {
      throw new Error(`Kein Stripe-Preis für Plan ${params.plan} konfiguriert`);
    }

    const session = await this.stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price, quantity: 1 }],
      success_url: params.successUrl,
      cancel_url: params.cancelUrl,
      customer_email: params.customerEmail,
      metadata: { organizationId: params.organizationId, plan: params.plan },
    });

    if (!session.url) throw new Error("Stripe lieferte keine Checkout-URL");
    return { id: session.id, url: session.url };
  }

  constructEvent(payload: Buffer, signature: string | undefined): BillingEvent {
    if (!signature) throw new Error("Fehlende Stripe-Signatur");
    const event = this.stripe.webhooks.constructEvent(payload, signature, this.webhookSecret);
    return event as unknown as BillingEvent;
  }
}
