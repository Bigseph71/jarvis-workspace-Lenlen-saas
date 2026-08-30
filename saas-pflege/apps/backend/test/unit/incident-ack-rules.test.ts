import { describe, it, expect } from "vitest";
import { checkIncidentAck } from "../../src/modules/visits/visit.rules.js";

/**
 * Kenntnisnahme eines gemeldeten Vorfalls.
 *
 * Die interessante Regel ist nicht "quittieren erlaubt/verboten", sondern der
 * dritte Ausgang: ein bereits quittierter Vorfall ist KEIN Fehler. Zwei
 * Koordinatoren sehen dieselbe Warnung und klicken beide – der zweite Klick
 * darf weder scheitern noch den ersten Namen überschreiben.
 */

const ACK_AT = new Date("2026-08-30T14:00:00.000Z");

describe("checkIncidentAck", () => {
  it("quittiert einen offenen Vorfall", () => {
    expect(checkIncidentAck({ hasIncident: true, incidentAckAt: null })).toBe("acknowledge");
  });

  it("weist einen Besuch ohne gemeldeten Vorfall ab", () => {
    // Sonst liesse sich jeder beliebige Besuch mit einem Quittungsvermerk
    // versehen, zu dem es nie eine Meldung gab.
    expect(checkIncidentAck({ hasIncident: false, incidentAckAt: null })).toBe("no_incident");
  });

  it("meldet einen bereits quittierten Vorfall als 'already', nicht als Fehler", () => {
    expect(checkIncidentAck({ hasIncident: true, incidentAckAt: ACK_AT })).toBe("already");
  });

  it("ein zurückgenommener Vorfall ist auch dann nicht quittierbar, wenn er quittiert war", () => {
    // hasIncident wurde beim Neuschreiben der Notiz entfernt. Es gibt nichts
    // mehr zur Kenntnis zu nehmen – der Zustand hat Vorrang vor der Historie.
    expect(checkIncidentAck({ hasIncident: false, incidentAckAt: ACK_AT })).toBe("no_incident");
  });
});
