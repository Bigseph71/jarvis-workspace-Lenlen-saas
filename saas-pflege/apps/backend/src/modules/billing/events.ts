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
