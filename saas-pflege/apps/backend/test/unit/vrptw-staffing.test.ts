import { describe, it, expect } from "vitest";
import {
  assessStaffing,
  emptyStaffing,
  type TourCaregiver,
  type VisitForStaffing,
} from "../../src/modules/vrptw/tour.rules.js";

/**
 * Darf die eingeteilte Fachkraft diese Tour fahren?
 *
 * Beide Regeln gab es schon, aber nur beim Zuweisen EINES Besuchs. Eine Tour
 * entsteht anders: der Optimierer ordnet Besuche, die längst zugewiesen sind.
 * Ändert sich danach ein Vertrag oder die Stamm-Fachkraft eines Patienten,
 * bleibt die Tour unauffällig bestehen -- geprüft wurde sie ja, damals.
 *
 * Die Termine unten liegen an einem MITTWOCH (2026-09-09) in deutscher Zeit.
 */

const WEDNESDAY = new Date("2026-09-09T08:00:00.000Z");

function caregiver(over: Partial<TourCaregiver> = {}): TourCaregiver {
  return {
    qualification: "PFLEGEFACHKRAFT",
    workDays: ["MON", "TUE", "WED", "THU", "FRI"],
    ...over,
  };
}

function visit(over: Partial<VisitForStaffing> = {}): VisitForStaffing {
  return {
    id: "v-1",
    scheduledAt: WEDNESDAY,
    isEmergency: false,
    assignedCaregiverId: "c-1",
    assignedCaregiver: { qualification: "PFLEGEFACHKRAFT" },
    patient: { firstName: "Ingrid", lastName: "Vogel" },
    ...over,
  };
}

describe("assessStaffing", () => {
  it("beanstandet nichts an einer regelkonformen Tour", () => {
    expect(assessStaffing(caregiver(), [visit(), visit({ id: "v-2" })])).toEqual({
      checked: true,
      issues: [],
    });
  });

  it("meldet einen Besuch an einem vertraglich freien Tag", () => {
    // Regel 5: die Planung haelt sich an die Arbeitstage des Vertrags. Eine
    // Halbtagskraft, die mittwochs nicht arbeitet, faehrt hier eine ganze Tour.
    const report = assessStaffing(caregiver({ workDays: ["MON", "TUE"] }), [visit()]);

    expect(report.issues).toEqual([
      {
        visitId: "v-1",
        patientName: "Ingrid Vogel",
        reason: "off_day",
        weekday: "WED",
      },
    ]);
  });

  it("meldet eine Vertretung mit anderer Qualifikation", () => {
    // Regel 4: die Vertretung muss dieselbe Qualifikation haben wie die
    // Stamm-Fachkraft. Eine Hilfskraft faehrt hier zu einem Patienten, der
    // einer Fachkraft zugeordnet ist.
    const report = assessStaffing(caregiver({ qualification: "PFLEGEHILFSKRAFT" }), [visit()]);

    expect(report.issues).toEqual([
      {
        visitId: "v-1",
        patientName: "Ingrid Vogel",
        reason: "qualification",
        actualQualification: "PFLEGEHILFSKRAFT",
        requiredQualification: "PFLEGEFACHKRAFT",
      },
    ]);
  });

  it("zählt einen Besuch höchstens einmal, auch wenn beides zutrifft", () => {
    // Sonst saehe die Tour doppelt so kaputt aus, wie sie ist -- und die Zahl
    // in der Uebersicht soll "so viele Besuche muss ich anfassen" heissen.
    // Der freie Tag steht zuerst: arbeitet sie gar nicht, ist die Frage nach
    // ihrer Qualifikation gegenstandslos.
    const report = assessStaffing(
      caregiver({ qualification: "PFLEGEHILFSKRAFT", workDays: ["MON"] }),
      [visit()],
    );

    expect(report.issues).toHaveLength(1);
    expect(report.issues[0]?.reason).toBe("off_day");
  });

  it("lässt Notfälle aus beiden Regeln heraus", () => {
    // Regel 2: ein Notfall entsteht ausserhalb des Zyklus und darf von jeder
    // aktiven Fachkraft gefahren werden. Wuerde er hier gemeldet, traege jede
    // Tour mit einem Notfall eine Warnung, die niemand aufloesen kann.
    const report = assessStaffing(caregiver({ qualification: "AUSZUBILDENDE", workDays: [] }), [
      visit({ isEmergency: true }),
    ]);

    expect(report.issues).toEqual([]);
  });

  it("prüft den Arbeitstag auch ohne Stamm-Fachkraft", () => {
    // Die Arbeitstag-Regel haengt an der Fahrerin, nicht am Patienten. Ein
    // Besuch ohne Zuordnung entbindet niemanden von seinem Vertrag.
    const report = assessStaffing(caregiver({ workDays: ["MON"] }), [
      visit({ assignedCaregiverId: null, assignedCaregiver: null }),
    ]);

    expect(report.issues.map((issue) => issue.reason)).toEqual(["off_day"]);
  });

  it("vergleicht keine Qualifikation, wenn es keine Stamm-Fachkraft gibt", () => {
    const report = assessStaffing(caregiver({ qualification: "AUSZUBILDENDE" }), [
      visit({ assignedCaregiverId: null, assignedCaregiver: null }),
    ]);

    expect(report.issues).toEqual([]);
  });

  it("meldet nichts, solange der Tour niemand zugeteilt ist", () => {
    // Ohne Fahrerin gibt es niemanden, gegen den sich pruefen liesse. Die
    // Uebersicht sagt in derselben Zeile bereits "Keine Fachkraft zugewiesen";
    // eine zweite Warnung daneben waere Laerm.
    const report = assessStaffing(null, [visit()]);

    expect(report).toEqual({ checked: false, issues: [] });
    expect(report.checked).toBe(false);
  });

  it("hält leere Arbeitstage nicht für 'arbeitet immer'", () => {
    // Ein leeres Feld ist keine Erlaubnis. Waere es eine, machte ein
    // unvollstaendiger Stammdatensatz die Regel lautlos wirkungslos.
    const report = assessStaffing(caregiver({ workDays: [] }), [visit()]);

    expect(report.issues.map((issue) => issue.reason)).toEqual(["off_day"]);
  });

  it("verträgt ein kaputtes Arbeitstage-Feld, ohne die Tour durchzuwinken", () => {
    // workDays ist JSON; ein Import (Phase 3) kann dort alles ablegen.
    const report = assessStaffing(caregiver({ workDays: "MON,WED" }), [visit()]);

    expect(report.issues.map((issue) => issue.reason)).toEqual(["off_day"]);
  });
});

describe("emptyStaffing", () => {
  it("gilt als geprüft, sobald eine Fachkraft eingeteilt ist", () => {
    // Eine leere Tour hat nichts zu beanstanden -- aber "nichts gefunden" und
    // "gar nicht geprueft" duerfen nicht dieselbe Antwort geben.
    expect(emptyStaffing(caregiver())).toEqual({ checked: true, issues: [] });
    expect(emptyStaffing(null)).toEqual({ checked: false, issues: [] });
  });
});
