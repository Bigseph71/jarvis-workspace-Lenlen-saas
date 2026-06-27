export interface CheckoutParams {
  organizationId: string;
  plan: string;
  successUrl: string;
  cancelUrl: string;
  customerEmail?: string;
}

export interface CheckoutSession {
  id: string;
  url: string;
}

export interface PortalParams {
  customerId: string;
  returnUrl: string;
}

/** Vereinfachtes Event (kompatibel zu Stripe.Event-Struktur). */
export interface BillingEvent {
  id?: string;
  type: string;
  data: { object: Record<string, unknown> };
}

export interface BillingProvider {
  readonly name: string;
  createCheckoutSession(params: CheckoutParams): Promise<CheckoutSession>;
  /** Self-Service-Portal (Zahlungsmittel, Rechnungen, Kündigung) für einen bestehenden Customer. */
  createPortalSession(params: PortalParams): Promise<{ url: string }>;
  /** Verifiziert die Signatur und liefert das Event (oder wirft). */
  constructEvent(payload: Buffer, signature: string | undefined): BillingEvent;
}
