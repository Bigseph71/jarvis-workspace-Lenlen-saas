import { SubscriptionStatus, prisma } from "@len-len/database";
import { env } from "../../config/env.js";

const MS_PER_DAY = 86_400_000;

/**
 * Testphase der Selbstregistrierung.
 *
 * Aufgebaut wie die Karenzzeit (grace.ts) und aus demselben Grund: der Sweep
 * ist ein einziges UPDATE über alle Organisationen, der Vergleich muss also in
 * der WHERE-Klausel stattfinden und nicht in JS. Deshalb hier ebenfalls ein
 * Cutoff statt einer Deadline je Zeile.
 */

/** Ende der Testphase für eine Registrierung zum Zeitpunkt `from`. */
export function trialEnd(from: Date = new Date(), days: number = env.TRIAL_PERIOD_DAYS): Date {
  return new Date(from.getTime() + days * MS_PER_DAY);
}

/** Verbleibende volle Tage (0 = abgelaufen). Für die Anzeige. */
export function trialDaysRemaining(trialEndsAt: Date, now: Date = new Date()): number {
  const ms = trialEndsAt.getTime() - now.getTime();
  return ms <= 0 ? 0 : Math.ceil(ms / MS_PER_DAY);
}

/**
 * Suspendiert alle Tenants, deren Testphase abgelaufen ist.
 *
 * Nur TRIAL wird angefasst. Wer zwischenzeitlich ein Abo abgeschlossen hat,
 * steht auf ACTIVE und hat `trialEndsAt` geleert – beide Bedingungen greifen,
 * damit ein zahlender Tenant nicht nachträglich suspendiert wird, falls eine
 * der beiden Angaben einmal nicht mitgezogen wurde.
 *
 * System-Pfad ohne Tenant-Kontext, daher `prisma` statt `withTenant`.
 * Liefert die Anzahl der suspendierten Tenants.
 */
export async function suspendExpiredTrials(now: Date = new Date()): Promise<number> {
  const result = await prisma.organization.updateMany({
    where: {
      subscriptionStatus: SubscriptionStatus.TRIAL,
      trialEndsAt: { not: null, lte: now },
    },
    data: { subscriptionStatus: SubscriptionStatus.SUSPENDED },
  });

  return result.count;
}
