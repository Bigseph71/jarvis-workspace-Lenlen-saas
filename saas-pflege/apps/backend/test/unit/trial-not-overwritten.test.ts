import { describe, it, expect } from "vitest";
import { SubscriptionStatus } from "@len-len/database";
import { mapEventToStatus, paymentEventMayOverwrite } from "../../src/modules/billing/events.js";

/**
 * Die Testphase darf von einem Zahlungs-Event nicht beendet werden.
 *
 * Vorgeschichte, in Produktion beobachtet: beim Start eines Abos mit
 * `trial_period_days` stellt Stripe sofort eine Rechnung über 0 € aus und
 * bezahlt sie. Es folgen `checkout.session.completed` und
 * `invoice.payment_succeeded`, die beide ACTIVE bedeuten – und die das
 * unmittelbar zuvor gesetzte TRIAL überschrieben.
 *
 * Ergebnis: JEDER Tenant stand direkt nach dem Checkout auf ACTIVE, mit einer
 * Testphase, die laut `trial_ends_at` noch zwei Wochen lief. Der MRR zählte sie
 * als Umsatz, und die Warnung "Testphase endet bald" lief nie an.
 */

const NOW = new Date("2026-09-02T14:00:00.000Z");
const IN_TWO_WEEKS = new Date("2026-09-16T14:00:00.000Z");
const LAST_MONTH = new Date("2026-08-02T14:00:00.000Z");

describe("Zahlungs-Events und laufende Testphase", () => {
  it("die 0-€-Rechnung zu Beginn beendet die Testphase NICHT", () => {
    // Der Kern des Fehlers.
    expect(paymentEventMayOverwrite(SubscriptionStatus.TRIAL, IN_TWO_WEEKS, NOW)).toBe(false);
  });

  it("eine ABGELAUFENE Testphase darf ein Zahlungs-Event sehr wohl auf ACTIVE ziehen", () => {
    // Dann ist die Zahlung genau der Beleg dafür, dass aus dem Test ein
    // zahlender Kunde geworden ist. Ein Schutz ohne diese Grenze würde einen
    // Tenant für immer in TRIAL einfrieren.
    expect(paymentEventMayOverwrite(SubscriptionStatus.TRIAL, LAST_MONTH, NOW)).toBe(true);
  });

  it("TRIAL ohne Datum ist nicht geschützt", () => {
    // Ein Status ohne Frist kann nicht ablaufen und wäre sonst endgültig.
    expect(paymentEventMayOverwrite(SubscriptionStatus.TRIAL, null, NOW)).toBe(true);
  });

  it("jeder andere Status wird von einem Zahlungs-Event normal überschrieben", () => {
    // Nach einem Zahlungsausfall ist die erfolgreiche Zahlung genau das
    // Ereignis, das den Tenant wieder freischalten muss.
    for (const status of [
      SubscriptionStatus.PAST_DUE,
      SubscriptionStatus.SUSPENDED,
      SubscriptionStatus.ACTIVE,
      SubscriptionStatus.CANCELED,
    ]) {
      expect(paymentEventMayOverwrite(status, IN_TWO_WEEKS, NOW)).toBe(true);
    }
  });

  it("die Grenze liegt exakt am Ablaufzeitpunkt", () => {
    expect(paymentEventMayOverwrite(SubscriptionStatus.TRIAL, NOW, NOW)).toBe(true);
    expect(
      paymentEventMayOverwrite(SubscriptionStatus.TRIAL, new Date(NOW.getTime() + 1), NOW),
    ).toBe(false);
  });
});

describe("mapEventToStatus", () => {
  it("bildet die drei Zahlungs-Events weiterhin auf ACTIVE ab", () => {
    // Absichtlich unverändert: die Abbildung ist richtig, falsch war, sie
    // ungeprüft zu schreiben. Wer sie hier entfernte, verlöre die
    // Wiederfreischaltung nach einem Zahlungsausfall.
    for (const type of [
      "checkout.session.completed",
      "invoice.paid",
      "invoice.payment_succeeded",
    ]) {
      expect(mapEventToStatus(type)).toBe(SubscriptionStatus.ACTIVE);
    }
  });

  it("ignoriert die Abo-Events – die laufen über mapSubscriptionStatus", () => {
    expect(mapEventToStatus("customer.subscription.created")).toBeNull();
    expect(mapEventToStatus("customer.subscription.updated")).toBeNull();
  });
});
