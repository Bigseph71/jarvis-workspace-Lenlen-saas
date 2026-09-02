import { InvoiceStatus, SubscriptionStatus } from "@len-len/database";

/**
 * Woher ein Status stammt – und damit, wie viel er wert ist.
 *
 * `subscription`: aus `customer.subscription.created/updated`, also aus dem
 * Abo-Objekt selbst. Das ist der Zustand des Abos, und er gilt.
 *
 * `payment`: aus einem Rechnungs- oder Checkout-Event. Das ist die Aussage
 * "es wurde bezahlt", nicht "das Abo ist aktiv". Der Unterschied war lange
 * folgenlos und ist es seit der Testphase nicht mehr: siehe
 * `paymentEventMayOverwrite`.
 */
export type StatusSource = "subscription" | "payment";

/**
 * Darf ein ZAHLUNGS-Event den vorhandenen Status überschreiben?
 *
 * Nein, solange eine Testphase läuft. Der Grund ist eine Eigenheit von Stripe,
 * die uns in Produktion eingeholt hat: beim Start eines Abos mit
 * `trial_period_days` wird sofort eine Rechnung über 0 € ausgestellt und
 * bezahlt. Stripe schickt daraufhin `invoice.payment_succeeded` – neben
 * `checkout.session.completed` –, und beide bedeuten hier ACTIVE.
 *
 * Trifft eines davon nach `customer.subscription.created` (Status `trialing`)
 * ein, überschreibt es TRIAL mit ACTIVE. Genau das ist passiert: sämtliche
 * Tenants standen unmittelbar nach dem Checkout auf ACTIVE, mit einer
 * Testphase, die laut `trial_ends_at` noch zwei Wochen lief.
 *
 * Die Folgen gingen über die Anzeige hinaus:
 *   - der MRR zählte Testphasen als Umsatz (die Prüfung in admin.service
 *     schliesst TRIAL aus, aber der Status stand ja auf ACTIVE),
 *   - die Warnung "Testphase endet bald" filtert auf TRIAL und lief nie an,
 *     also erfuhr niemand vor der ersten Belastung davon.
 *
 * Die Bedingung fragt zusätzlich nach `trialEndsAt`: nur eine LAUFENDE
 * Testphase ist geschützt. Eine abgelaufene darf ein Zahlungs-Event sehr wohl
 * auf ACTIVE ziehen – dann ist die Zahlung ja gerade der Beleg dafür, dass aus
 * dem Test ein zahlender Kunde geworden ist.
 */
export function paymentEventMayOverwrite(
  current: SubscriptionStatus,
  trialEndsAt: Date | null,
  now: Date,
): boolean {
  const runningTrial =
    current === SubscriptionStatus.TRIAL && trialEndsAt !== null && trialEndsAt.getTime() > now.getTime();
  return !runningTrial;
}

/**
 * Bildet einen Stripe-Event-Typ auf den Abo-Status ab.
 * null = Event wird ignoriert.
 *
 * ACHTUNG: Die Rückgabe ist eine ZAHLUNGS-Aussage (StatusSource "payment") und
 * darf nicht ungeprüft geschrieben werden – siehe `paymentEventMayOverwrite`.
 */
export function mapEventToStatus(eventType: string): SubscriptionStatus | null {
  switch (eventType) {
    case "checkout.session.completed":
    case "invoice.paid":
    case "invoice.payment_succeeded":
      return SubscriptionStatus.ACTIVE;
    case "invoice.payment_failed":
      // Regel 8: PAST_DUE startet die Karenzzeit; die Suspendierung übernimmt
      // nach deren Ablauf der Billing-Worker (siehe grace.ts).
      return SubscriptionStatus.PAST_DUE;
    case "customer.subscription.deleted":
      return SubscriptionStatus.CANCELED;
    default:
      return null;
  }
}

/**
 * Status einer gespiegelten Rechnung. Der Event-Typ hat Vorrang vor dem
 * Objekt-Status: bei `invoice.payment_failed` bleibt die Stripe-Rechnung selbst
 * auf `open` – nur der Event sagt uns, dass die Zahlung scheiterte.
 * null = kein Rechnungs-Event.
 */
export function mapInvoiceStatus(eventType: string, stripeStatus?: string): InvoiceStatus | null {
  switch (eventType) {
    case "invoice.paid":
    case "invoice.payment_succeeded":
      return InvoiceStatus.PAID;
    case "invoice.payment_failed":
      return InvoiceStatus.FAILED;
    case "invoice.voided":
      return InvoiceStatus.VOID;
    case "invoice.created":
    case "invoice.finalized":
    case "invoice.updated":
      break;
    default:
      return null;
  }

  switch (stripeStatus) {
    case "paid":
      return InvoiceStatus.PAID;
    case "void":
      return InvoiceStatus.VOID;
    case "uncollectible":
      return InvoiceStatus.FAILED;
    case "draft":
    case "open":
      return InvoiceStatus.OPEN;
    default:
      return null;
  }
}

/**
 * Bildet den REALEN Stripe-Subscription-Status (aus subscription.updated/created)
 * auf unseren Status ab. Hierüber greift die automatische Suspendierung (Regel 8):
 * `unpaid` nach erschöpften Smart Retries -> SUSPENDED. null = ignorieren.
 */
export function mapSubscriptionStatus(stripeStatus: string): SubscriptionStatus | null {
  switch (stripeStatus) {
    // Getrennt von "active": während der Testphase liegt bereits ein
    // Zahlungsmittel vor und das Abo läuft, es wird nur noch nichts belastet.
    // Der Unterschied ist rein anzeigerelevant – der Zugang ist derselbe.
    case "trialing":
      return SubscriptionStatus.TRIAL;
    case "active":
      return SubscriptionStatus.ACTIVE;
    case "past_due":
      return SubscriptionStatus.PAST_DUE;
    case "canceled":
      return SubscriptionStatus.CANCELED;
    case "unpaid":
    case "incomplete_expired":
    case "paused":
      return SubscriptionStatus.SUSPENDED;
    default:
      // incomplete/unbekannt: noch kein finaler Zustand -> ignorieren.
      return null;
  }
}
