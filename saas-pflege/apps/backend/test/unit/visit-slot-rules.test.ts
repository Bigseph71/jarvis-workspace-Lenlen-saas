import { describe, it, expect } from "vitest";
import {
  caregiverSlotWindow,
  collidesWithSlot,
  CAREGIVER_SLOT_MINUTES,
} from "../../src/modules/visits/visit.rules.js";

/**
 * Doppelbuchung derselben Fachkraft.
 *
 * Das System liess zwei Besuche zur selben Minute zu. Nichts hielt es auf:
 * Regel 1 zaehlt je PATIENT und Woche, die Arbeitstagspruefung kennt nur den
 * Wochentag. Wer den Fehler machte, sah ihn erst auf der Tour -- und die
 * zweite Patientin wartete.
 */

const TERMIN = new Date("2026-09-07T08:00:00.000Z");
const minutesAfter = (m: number): Date => new Date(TERMIN.getTime() + m * 60_000);

describe("collidesWithSlot", () => {
  it("erkennt denselben Termin", () => {
    expect(collidesWithSlot(TERMIN, TERMIN)).toBe(true);
  });

  it("erkennt eine Kollision in BEIDE Richtungen", () => {
    // Symmetrisch, sonst liesse sich die Doppelbuchung anlegen, indem man die
    // beiden Termine in der anderen Reihenfolge erfasst.
    expect(collidesWithSlot(TERMIN, minutesAfter(10))).toBe(true);
    expect(collidesWithSlot(TERMIN, minutesAfter(-10))).toBe(true);
  });

  it("laesst genau den Mindestabstand zu", () => {
    // 15 Minuten sind erlaubt, 14 nicht. Ohne diese Festlegung haengt das
    // Ergebnis an einer Sekunde.
    expect(collidesWithSlot(TERMIN, minutesAfter(CAREGIVER_SLOT_MINUTES))).toBe(false);
    expect(collidesWithSlot(TERMIN, minutesAfter(CAREGIVER_SLOT_MINUTES - 1))).toBe(true);
    expect(collidesWithSlot(TERMIN, minutesAfter(-CAREGIVER_SLOT_MINUTES))).toBe(false);
  });

  it("laesst einen weit entfernten Termin in Ruhe", () => {
    expect(collidesWithSlot(TERMIN, minutesAfter(60))).toBe(false);
  });
});

describe("caregiverSlotWindow", () => {
  it("spannt das Fenster symmetrisch um den Termin", () => {
    const { start, end } = caregiverSlotWindow(TERMIN);

    expect(end.getTime() - TERMIN.getTime()).toBe(CAREGIVER_SLOT_MINUTES * 60_000);
    expect(TERMIN.getTime() - start.getTime()).toBe(CAREGIVER_SLOT_MINUTES * 60_000 - 1);
  });

  it("deckt genau die Termine ab, die collidesWithSlot meldet", () => {
    // Die Datenbankabfrage benutzt das Fenster, die Regel den Vergleich. Laufen
    // beide auseinander, prueft die Abfrage etwas anderes als der Test -- und
    // genau das faellt sonst niemandem auf.
    const { start, end } = caregiverSlotWindow(TERMIN);

    for (let m = -30; m <= 30; m += 1) {
      const other = minutesAfter(m);
      const imFenster = other >= start && other < end;
      expect(imFenster, `${m} Min.`).toBe(collidesWithSlot(TERMIN, other));
    }
  });
});
