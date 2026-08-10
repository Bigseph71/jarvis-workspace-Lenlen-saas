const MS_PER_DAY = 86_400_000;

/**
 * Anzeige-Helfer für die Testphase.
 *
 * Die Testphase selbst wird von STRIPE geführt: `trial_period_days` am Abo,
 * Status `trialing`, danach selbsttätiger Übergang auf `active` und die erste
 * Belastung. Es gibt hier bewusst keinen eigenen Ablauf-Sweep mehr – zwei
 * Instanzen, die dieselbe Frist verwalten, geraten unweigerlich auseinander,
 * und die zahlungsführende ist Stripe.
 *
 * `trialEndsAt` am Tenant ist nur eine Spiegelung von `trial_end` aus den
 * Webhooks, damit die Abrechnungsseite ein Datum zeigen kann, ohne Stripe zu
 * befragen.
 */

/** Verbleibende volle Tage (0 = abgelaufen). Für die Anzeige. */
export function trialDaysRemaining(trialEndsAt: Date, now: Date = new Date()): number {
  const ms = trialEndsAt.getTime() - now.getTime();
  return ms <= 0 ? 0 : Math.ceil(ms / MS_PER_DAY);
}
