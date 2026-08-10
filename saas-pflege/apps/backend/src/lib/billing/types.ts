export interface CheckoutParams {
  organizationId: string;
  plan: string;
  successUrl: string;
  cancelUrl: string;
  /** Vorbelegung der E-Mail, wenn noch kein Customer existiert. */
  customerEmail?: string;
  /** Bestehender Stripe-Customer des Tenants, falls schon einer angelegt wurde. */
  customerId?: string;
  /**
   * Länge der Testphase in Tagen, die Stripe dem Abo voranstellt. Nur beim
   * ERSTEN Abschluss gesetzt – ein Planwechsel darf keine neue Testphase
   * schenken.
   */
  trialDays?: number;
}

export interface CheckoutSession {
  id: string;
  url: string;
}

export interface PortalParams {
  customerId: string;
  returnUrl: string;
}

export interface PlanChangeParams {
  organizationId: string;
  /** Bestehendes, bei Stripe noch laufendes Abo des Tenants. */
  subscriptionId: string;
  plan: string;
}

/** Zustand eines Abos, wie ihn NUR Stripe kennt. */
export interface SubscriptionState {
  /** Roher Stripe-Status (`active`, `unpaid`, `canceled`, …), für Logs. */
  status: string;
  /**
   * true, solange das Abo bei Stripe fortbesteht und wieder abrechnen kann.
   * Dann ist ein zweiter Checkout eine Doppelbelastung, der Plan MUSS an
   * diesem Abo gewechselt werden.
   */
  live: boolean;
  /**
   * Plan hinter dem aktuell gebuchten Preis. null, wenn er sich nicht eindeutig
   * bestimmen lässt: Sonderpreis oder mehrere Positionen.
   */
  plan: string | null;
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
  /**
   * Wechselt den Plan am BESTEHENDEN Abo. Zwingend statt eines zweiten
   * Checkouts, sobald der Tenant schon ein laufendes Abo hat – sonst legt
   * Stripe ein zweites an und der Kunde zahlt doppelt.
   */
  changeSubscriptionPlan(params: PlanChangeParams): Promise<void>;
  /**
   * Fragt den tatsächlichen Zustand eines Abos beim Anbieter ab.
   * null = dort nicht (mehr) vorhanden, die gespeicherte ID zeigt ins Leere.
   */
  getSubscriptionState(subscriptionId: string): Promise<SubscriptionState | null>;
  /** Verifiziert die Signatur und liefert das Event (oder wirft). */
  constructEvent(payload: Buffer, signature: string | undefined): BillingEvent;
}
