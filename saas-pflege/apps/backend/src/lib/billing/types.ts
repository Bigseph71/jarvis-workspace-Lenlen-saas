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

/**
 * Wiederkehrender Monatsumsatz, aus den laufenden Abos des Anbieters.
 *
 * Betrag in der kleinsten Währungseinheit (Cent), wie überall im Billing.
 * `subscriptions` ist die Zahl der Abos, aus denen er stammt – ohne sie liesse
 * sich ein Wert von 0 nicht deuten (kein Abo? oder alle beitragsfrei?).
 */
export interface RecurringRevenue {
  amountCents: number;
  currency: string;
  subscriptions: number;
  /**
   * true, wenn nicht alle Abos gezählt werden konnten (Seitenlimit erreicht).
   * Der Wert ist dann eine Untergrenze und wird im Panel so ausgewiesen –
   * eine zu niedrige Zahl als exakt auszugeben wäre schlimmer als sie zu
   * kennzeichnen.
   */
  truncated: boolean;
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
  /**
   * Summiert die laufenden Abos zum monatlichen Umsatz (Super-Admin-Panel).
   *
   * Die BETRÄGE kommen vom Anbieter – was ein Tenant zahlt, weiss nur Stripe:
   * die lokale Tabelle kennt den Plan, nicht den Preis, und Rabatte oder
   * Sonderpreise gar nicht.
   *
   * WELCHE Abos zählen, entscheidet dagegen die eigene Datenbank, und deshalb
   * gibt der Aufrufer sie vor. Stripe weiss nichts von einer im Panel
   * gelöschten Organisation und nichts von unseren Status: ohne diese Liste
   * zählte ein Abo weiter mit, dessen Kunde bei uns längst gelöscht ist.
   *
   * @param eligibleSubscriptionIds Abos, die gezählt werden dürfen. Leer =
   *   Ergebnis 0, nicht "alle" – ein leerer Filter darf nie zu einer Summe
   *   über fremde Abos führen.
   */
  getRecurringRevenue(eligibleSubscriptionIds: ReadonlySet<string>): Promise<RecurringRevenue>;
}
