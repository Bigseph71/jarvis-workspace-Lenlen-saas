import { describe, it, expect } from "vitest";
import { isDelayed, DELAY_THRESHOLD_MINUTES } from "../../src/modules/visits/visit.rules.js";

/**
 * Verspaetung im Sinne der Uebersicht.
 *
 * Diese Regel erzeugt eine ZAHL AUF DEM STARTBILDSCHIRM, nach der eine
 * Koordination ihren Morgen richtet. Zu scharf gefasst zaehlt sie das Rauschen
 * einer jeden Tour mit und wird nach einer Woche ignoriert; zu lasch gefasst
 * verschweigt sie wartende Patienten.
 */

const TERMIN = new Date("2026-09-07T08:00:00.000Z");
const minutesAfter = (m: number): Date => new Date(TERMIN.getTime() + m * 60_000);

describe("isDelayed", () => {
  it("zaehlt eine Ankunft jenseits der Schwelle", () => {
    expect(isDelayed({ scheduledAt: TERMIN, gpsArrivalAt: minutesAfter(16) })).toBe(true);
  });

  it("zaehlt die uebliche kleine Abweichung NICHT", () => {
    // Eine Pflegetour laeuft nie auf die Minute. Zwei Minuten sind keine
    // Verspaetung, sondern der Normalfall.
    expect(isDelayed({ scheduledAt: TERMIN, gpsArrivalAt: minutesAfter(2) })).toBe(false);
  });

  it("die Schwelle ist eine Untergrenze, kein Mindestwert", () => {
    // Genau auf der Schwelle noch nicht verspaetet, eine Minute darueber schon.
    const grenze = minutesAfter(DELAY_THRESHOLD_MINUTES);
    expect(isDelayed({ scheduledAt: TERMIN, gpsArrivalAt: grenze })).toBe(false);
    expect(isDelayed({ scheduledAt: TERMIN, gpsArrivalAt: minutesAfter(DELAY_THRESHOLD_MINUTES + 1) })).toBe(true);
  });

  it("ohne Ankunfts-Pointage ist nichts verspaetet", () => {
    // Vor der Ankunft gibt es keine Verspaetung, sondern eine Erwartung. Ein
    // ungepointeter Besuch darf die Kennzahl weder heben noch senken.
    expect(isDelayed({ scheduledAt: TERMIN, gpsArrivalAt: null })).toBe(false);
  });

  it("eine fruehe Ankunft ist nie verspaetet", () => {
    // Die Schwelle ist eine Untergrenze, kein Betrag: minus 20 Minuten sind
    // nicht "20 Minuten Abweichung".
    expect(isDelayed({ scheduledAt: TERMIN, gpsArrivalAt: minutesAfter(-20) })).toBe(false);
  });

  it("nimmt eine abweichende Schwelle an", () => {
    // Der Aufrufer kann sie setzen; die Vorgabe ist nur die Vorgabe.
    expect(isDelayed({ scheduledAt: TERMIN, gpsArrivalAt: minutesAfter(6) }, 5)).toBe(true);
    expect(isDelayed({ scheduledAt: TERMIN, gpsArrivalAt: minutesAfter(6) }, 30)).toBe(false);
  });
});
