import Stripe from "stripe";
import { env } from "../../config/env.js";
import type {
  BillingEvent,
  BillingProvider,
  CheckoutParams,
  CheckoutSession,
  PortalParams,
} from "./types.js";

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

    const metadata = { organizationId: params.organizationId, plan: params.plan };

    const session = await this.stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price, quantity: 1 }],
      success_url: params.successUrl,
      cancel_url: params.cancelUrl,
      // Bestehenden Customer wiederverwenden. Ohne das legt Stripe bei jedem
      // Checkout einen neuen an: das alte Abo bliebe an der verwaisten
      // Kundennummer hängen, und stripeCustomerId zeigte nur noch auf die
      // letzte – das Self-Service-Portal und die Rechnungen des alten Abos
      // wären für den Tenant verloren.
      // Stripe verbietet customer und customer_email gleichzeitig.
      ...(params.customerId
        ? { customer: params.customerId }
        : { customer_email: params.customerEmail }),
      metadata,
      // Dieselben Angaben am ABO: customer.subscription.created trifft unter
      // Umständen ein, bevor checkout.session.completed die Customer-ID beim
      // Tenant gespeichert hat. Ohne diese Metadaten wäre das Event dann keinem
      // Tenant zuzuordnen und würde stillschweigend verworfen.
      subscription_data: { metadata },
    });

    if (!session.url) throw new Error("Stripe lieferte keine Checkout-URL");
    return { id: session.id, url: session.url };
  }

  async createPortalSession(params: PortalParams): Promise<{ url: string }> {
    const session = await this.stripe.billingPortal.sessions.create({
      customer: params.customerId,
      return_url: params.returnUrl,
    });
    return { url: session.url };
  }

  constructEvent(payload: Buffer, signature: string | undefined): BillingEvent {
    if (!signature) throw new Error("Fehlende Stripe-Signatur");
    const event = this.stripe.webhooks.constructEvent(payload, signature, this.webhookSecret);
    return event as unknown as BillingEvent;
  }
}
