import { SubscriptionStatus } from "@len-len/database";

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
      // Regel 8: nach Karenzzeit -> SUSPENDED. Vorerst PAST_DUE.
      return SubscriptionStatus.PAST_DUE;
    case "customer.subscription.deleted":
      return SubscriptionStatus.CANCELED;
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
