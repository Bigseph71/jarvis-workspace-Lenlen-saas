import { describe, it, expect } from "vitest";
import { trialEnd, trialDaysRemaining } from "../../src/modules/billing/trial.js";

/**
 * Testphase der Selbstregistrierung.
 *
 * Was hier hängt: ohne Ablauf wäre die öffentliche Registrierung ein
 * unbefristeter Gratis-Tarif. Die Frist selbst ist reine Arithmetik, ihre
 * Randfälle aber entscheiden darüber, ob ein Tenant einen Tag zu früh oder
 * einen Tag zu spät gesperrt wird.
 */

const DAY = 86_400_000;
const NOW = new Date("2026-08-10T09:00:00.000Z");

describe("trialEnd", () => {
  it("liegt volle N Tage nach dem Startzeitpunkt", () => {
    expect(trialEnd(NOW, 14).toISOString()).toBe("2026-08-24T09:00:00.000Z");
  });

  it("bei 0 Tagen endet die Phase sofort", () => {
    // TRIAL_PERIOD_DAYS=0 schaltet die Testphase ab: der nächste Sweep
    // suspendiert direkt.
    expect(trialEnd(NOW, 0).getTime()).toBe(NOW.getTime());
  });
});

describe("trialDaysRemaining", () => {
  it("zählt angefangene Tage voll", () => {
    // 13 Tage und 1 Stunde -> der Nutzer soll 14 lesen, nicht 13: er hat
    // heute noch Zeit.
    const endsAt = new Date(NOW.getTime() + 13 * DAY + 3_600_000);
    expect(trialDaysRemaining(endsAt, NOW)).toBe(14);
  });

  it("liefert 1 am letzten Tag", () => {
    expect(trialDaysRemaining(new Date(NOW.getTime() + 3_600_000), NOW)).toBe(1);
  });

  it("liefert 0 im Moment des Ablaufs", () => {
    // Genau 0, nicht negativ: die Anzeige soll nie "-2 Tage" zeigen.
    expect(trialDaysRemaining(NOW, NOW)).toBe(0);
  });

  it("liefert 0 für eine längst abgelaufene Frist", () => {
    expect(trialDaysRemaining(new Date(NOW.getTime() - 5 * DAY), NOW)).toBe(0);
  });
});
