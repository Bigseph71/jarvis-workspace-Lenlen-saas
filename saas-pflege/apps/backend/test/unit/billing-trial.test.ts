import { describe, it, expect } from "vitest";
import { trialDaysRemaining } from "../../src/modules/billing/trial.js";
import { mapSubscriptionStatus } from "../../src/modules/billing/events.js";

/**
 * Testphase.
 *
 * Sie wird von STRIPE geführt (trial_period_days am Abo). Lokal bleiben zwei
 * Dinge zu prüfen: dass der Stripe-Status "trialing" nicht mehr als "aktiv"
 * verbucht wird – sonst zeigte die Oberfläche ein zahlendes Abo, wo noch eine
 * Frist läuft – und die Anzeige der Restlaufzeit.
 */

const DAY = 86_400_000;
const NOW = new Date("2026-08-10T09:00:00.000Z");

describe("mapSubscriptionStatus", () => {
  it("unterscheidet die Testphase vom laufenden Abo", () => {
    expect(mapSubscriptionStatus("trialing")).toBe("TRIAL");
    expect(mapSubscriptionStatus("active")).toBe("ACTIVE");
  });

  it("behandelt die übrigen Zustände unverändert", () => {
    expect(mapSubscriptionStatus("past_due")).toBe("PAST_DUE");
    expect(mapSubscriptionStatus("canceled")).toBe("CANCELED");
    // Nach erschöpften Zahlungsversuchen: Zugang zu -> Regel 8.
    expect(mapSubscriptionStatus("unpaid")).toBe("SUSPENDED");
    // Erstzahlung nie durchgekommen: kein Endzustand, wird ignoriert.
    expect(mapSubscriptionStatus("incomplete")).toBeNull();
  });
});

describe("trialDaysRemaining", () => {
  it("zählt angefangene Tage voll", () => {
    // 13 Tage und 1 Stunde -> der Nutzer soll 14 lesen, nicht 13: er hat
    // heute noch Zeit.
    expect(trialDaysRemaining(new Date(NOW.getTime() + 13 * DAY + 3_600_000), NOW)).toBe(14);
  });

  it("liefert 1 am letzten Tag", () => {
    expect(trialDaysRemaining(new Date(NOW.getTime() + 3_600_000), NOW)).toBe(1);
  });

  it("liefert 0 im Moment des Ablaufs und danach", () => {
    // Genau 0, nie negativ: die Anzeige soll kein "-2 Tage" zeigen.
    expect(trialDaysRemaining(NOW, NOW)).toBe(0);
    expect(trialDaysRemaining(new Date(NOW.getTime() - 5 * DAY), NOW)).toBe(0);
  });
});
