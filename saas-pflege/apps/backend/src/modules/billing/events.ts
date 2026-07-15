import { InvoiceStatus, SubscriptionStatus } from "@len-len/database";

/**
 * Bildet einen Stripe-Event-Typ auf den Abo-Status ab.
 * null = Event wird ignoriert.
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
    case "active":
    case "trialing":
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
