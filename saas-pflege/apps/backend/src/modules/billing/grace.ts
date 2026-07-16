import { SubscriptionStatus, prisma } from "@len-len/database";
import { env } from "../../config/env.js";

const MS_PER_DAY = 86_400_000;

/**
 * Ende der Karenzzeit: ab wann ein zahlungssäumiger Tenant suspendiert wird
 * (Regel 8). `pastDueSince` = erster fehlgeschlagener Zahlungsversuch.
 */
export function graceDeadline(
  pastDueSince: Date,
  graceDays: number = env.BILLING_GRACE_PERIOD_DAYS,
): Date {
  return new Date(pastDueSince.getTime() + graceDays * MS_PER_DAY);
}

/**
 * Kipppunkt des Suspendierungs-Laufs: Tenants, deren `pastDueSince` auf oder vor
 * diesem Zeitpunkt liegt, haben ihre Karenzzeit aufgebraucht.
 *
 * Das ist die Umkehrung von graceDeadline – `pastDueSince <= graceCutoff(now)`
 * ist äquivalent zu `now >= graceDeadline(pastDueSince)`. Als Cutoff formuliert,
 * weil die Suspendierung ein einzelnes UPDATE über alle Tenants ist und der
 * Vergleich daher in der WHERE-Klausel stattfinden muss, nicht in JS.
 * Bei graceDays = 0 ist der Cutoff `now` -> sofortige Suspendierung.
 */
export function graceCutoff(
  now: Date = new Date(),
  graceDays: number = env.BILLING_GRACE_PERIOD_DAYS,
): Date {
  return new Date(now.getTime() - graceDays * MS_PER_DAY);
}

/** Verbleibende volle Tage der Karenzzeit (0 = abgelaufen). Für die Anzeige. */
export function graceDaysRemaining(
  pastDueSince: Date,
  now: Date = new Date(),
  graceDays: number = env.BILLING_GRACE_PERIOD_DAYS,
): number {
  const ms = graceDeadline(pastDueSince, graceDays).getTime() - now.getTime();
  return ms <= 0 ? 0 : Math.ceil(ms / MS_PER_DAY);
}

/**
 * Suspendiert alle Tenants, deren Karenzzeit abgelaufen ist (Regel 8).
 * System-Pfad: kein Tenant-Kontext, läuft über ALLE Organisationen – deshalb
 * bewusst `prisma` statt `withTenant`.
 *
 * Nur PAST_DUE wird angefasst: ein Tenant, der zwischenzeitlich wieder bezahlt
 * hat (-> ACTIVE, pastDueSince geleert), oder der bereits gekündigt hat
 * (CANCELED), darf hier nicht mehr getroffen werden.
 *
 * Liefert die Anzahl der suspendierten Tenants.
 */
export async function suspendExpiredGracePeriods(now: Date = new Date()): Promise<number> {
  const result = await prisma.organization.updateMany({
    where: {
      subscriptionStatus: SubscriptionStatus.PAST_DUE,
      pastDueSince: { not: null, lte: graceCutoff(now) },
    },
    data: { subscriptionStatus: SubscriptionStatus.SUSPENDED },
  });

  return result.count;
}
