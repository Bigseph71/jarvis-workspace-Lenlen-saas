import { describe, it, expect } from "vitest";
import { durationParts, visitDurationMinutes } from "../src/lib/history";

/**
 * Dauer eines erledigten Besuchs.
 *
 * Eine falsch gerechnete Dauer ist auf dem Telefon nicht zu erkennen: 45
 * Minuten sehen genauso plausibel aus wie 54. Und sie steht in einem
 * Rückblick, den jemand liest, um zu wissen, wie lange er gebraucht hat.
 */

describe("visitDurationMinutes", () => {
  it("rechnet aus Ankunft und Abfahrt in ganzen Minuten", () => {
    expect(
      visitDurationMinutes({
        gpsArrivalAt: "2026-09-03T08:02:00.000Z",
        gpsDepartureAt: "2026-09-03T08:47:00.000Z",
      }),
    ).toBe(45);
  });

  it("rundet Sekunden auf ganze Minuten", () => {
    expect(
      visitDurationMinutes({
        gpsArrivalAt: "2026-09-03T08:00:00.000Z",
        gpsDepartureAt: "2026-09-03T08:30:40.000Z",
      }),
    ).toBe(31);
  });

  it("gibt null zurück, solange die Abfahrt fehlt", () => {
    // Kommt vor: eine vergessene Abfahrt trägt die Koordination nach. Bis
    // dahin schreibt die Anzeige einen Strich – eine "0 Min." wäre eine
    // Behauptung über einen Besuch, der stattgefunden hat.
    expect(
      visitDurationMinutes({ gpsArrivalAt: "2026-09-03T08:00:00.000Z", gpsDepartureAt: null }),
    ).toBeNull();
    expect(
      visitDurationMinutes({ gpsArrivalAt: null, gpsDepartureAt: "2026-09-03T08:30:00.000Z" }),
    ).toBeNull();
  });

  it("gibt null statt einer negativen Dauer zurück", () => {
    // Nachgereichte Offline-Pointages tragen die Uhr des Geräts (lib/pointage).
    // Eine Abfahrt vor der Ankunft ist ein Datenfehler, keine Dauer.
    expect(
      visitDurationMinutes({
        gpsArrivalAt: "2026-09-03T08:30:00.000Z",
        gpsDepartureAt: "2026-09-03T08:00:00.000Z",
      }),
    ).toBeNull();
  });

  it("gibt null bei einem unlesbaren Datum zurück, statt NaN anzuzeigen", () => {
    expect(
      visitDurationMinutes({ gpsArrivalAt: "kaputt", gpsDepartureAt: "2026-09-03T08:00:00.000Z" }),
    ).toBeNull();
  });
});

describe("durationParts", () => {
  it("zerlegt in Stunden und Restminuten", () => {
    expect(durationParts(95)).toEqual({ hours: 1, minutes: 35 });
  });

  it("lässt die Stunden weg, solange keine volle vergangen ist", () => {
    expect(durationParts(45)).toEqual({ hours: 0, minutes: 45 });
  });

  it("meldet eine volle Stunde ohne Restminuten", () => {
    expect(durationParts(120)).toEqual({ hours: 2, minutes: 0 });
  });
});
