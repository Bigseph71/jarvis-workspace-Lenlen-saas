import { describe, it, expect } from "vitest";
import {
  assessStaffing,
  emptyStaffing,
  type TourAbsence,
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

/** Genehmigte Abwesenheit, standardmässig genau am Testtag. */
function absence(over: Partial<TourAbsence> = {}): TourAbsence {
  return {
    type: "SICK",
    startDate: new Date("2026-09-09T00:00:00.000Z"),
    endDate: new Date("2026-09-09T00:00:00.000Z"),
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
    expect(assessStaffing(caregiver(), [visit(), visit({ id: "v-2" })], [])).toEqual({
      checked: true,
      issues: [],
    });
  });

  it("meldet einen Besuch an einem vertraglich freien Tag", () => {
    // Regel 5: die Planung haelt sich an die Arbeitstage des Vertrags. Eine
    // Halbtagskraft, die mittwochs nicht arbeitet, faehrt hier eine ganze Tour.
    const report = assessStaffing(caregiver({ workDays: ["MON", "TUE"] }), [visit()], []);

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
    const report = assessStaffing(caregiver({ qualification: "PFLEGEHILFSKRAFT" }), [visit()], []);

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
      [],
    );

    expect(report.issues).toHaveLength(1);
    expect(report.issues[0]?.reason).toBe("off_day");
  });

  it("lässt Notfälle aus beiden Regeln heraus", () => {
    // Regel 2: ein Notfall entsteht ausserhalb des Zyklus und darf von jeder
    // aktiven Fachkraft gefahren werden. Wuerde er hier gemeldet, traege jede
    // Tour mit einem Notfall eine Warnung, die niemand aufloesen kann.
    const report = assessStaffing(
      caregiver({ qualification: "AUSZUBILDENDE", workDays: [] }),
      [visit({ isEmergency: true })],
      [],
    );

    expect(report.issues).toEqual([]);
  });

  it("prüft den Arbeitstag auch ohne Stamm-Fachkraft", () => {
    // Die Arbeitstag-Regel haengt an der Fahrerin, nicht am Patienten. Ein
    // Besuch ohne Zuordnung entbindet niemanden von seinem Vertrag.
    const report = assessStaffing(
      caregiver({ workDays: ["MON"] }),
      [visit({ assignedCaregiverId: null, assignedCaregiver: null })],
      [],
    );

    expect(report.issues.map((issue) => issue.reason)).toEqual(["off_day"]);
  });

  it("vergleicht keine Qualifikation, wenn es keine Stamm-Fachkraft gibt", () => {
    const report = assessStaffing(
      caregiver({ qualification: "AUSZUBILDENDE" }),
      [visit({ assignedCaregiverId: null, assignedCaregiver: null })],
      [],
    );

    expect(report.issues).toEqual([]);
  });

  it("meldet nichts, solange der Tour niemand zugeteilt ist", () => {
    // Ohne Fahrerin gibt es niemanden, gegen den sich pruefen liesse. Die
    // Uebersicht sagt in derselben Zeile bereits "Keine Fachkraft zugewiesen";
    // eine zweite Warnung daneben waere Laerm.
    const report = assessStaffing(null, [visit()], []);

    expect(report).toEqual({ checked: false, issues: [] });
    expect(report.checked).toBe(false);
  });

  it("hält leere Arbeitstage nicht für 'arbeitet immer'", () => {
    // Ein leeres Feld ist keine Erlaubnis. Waere es eine, machte ein
    // unvollstaendiger Stammdatensatz die Regel lautlos wirkungslos.
    const report = assessStaffing(caregiver({ workDays: [] }), [visit()], []);

    expect(report.issues.map((issue) => issue.reason)).toEqual(["off_day"]);
  });

  it("verträgt ein kaputtes Arbeitstage-Feld, ohne die Tour durchzuwinken", () => {
    // workDays ist JSON; ein Import (Phase 3) kann dort alles ablegen.
    const report = assessStaffing(caregiver({ workDays: "MON,WED" }), [visit()], []);

    expect(report.issues.map((issue) => issue.reason)).toEqual(["off_day"]);
  });
});

describe("assessStaffing – Abwesenheiten", () => {
  it("meldet einen Besuch, während die Fachkraft krankgeschrieben ist", () => {
    // Die Luecke, die diese Fassung schliesst: eine genehmigte Krankmeldung
    // nimmt der Fachkraft den Tag, aber bisher keine ihrer Touren. Eine Tour,
    // die niemand faehrt, sieht genauso aus wie eine gefahrene -- bis der
    // erste Patient anruft.
    const report = assessStaffing(caregiver(), [visit()], [absence()]);

    expect(report.issues).toEqual([
      {
        visitId: "v-1",
        patientName: "Ingrid Vogel",
        reason: "absence",
        absenceType: "SICK",
      },
    ]);
  });

  it("zählt beide Enden des Zeitraums mit", () => {
    // Wer bis Freitag krankgeschrieben ist, ist am Freitag krank. Ein
    // halboffenes Intervall liesse genau den letzten Tag durchfallen -- den
    // Tag, an dem die Rueckkehr geplant wird.
    const urlaub = absence({
      type: "VACATION",
      startDate: new Date("2026-09-07T00:00:00.000Z"),
      endDate: new Date("2026-09-09T00:00:00.000Z"),
    });

    expect(assessStaffing(caregiver(), [visit()], [urlaub]).issues).toHaveLength(1);
  });

  it("lässt eine Abwesenheit ausserhalb des Tages in Ruhe", () => {
    const davor = absence({
      startDate: new Date("2026-09-01T00:00:00.000Z"),
      endDate: new Date("2026-09-08T00:00:00.000Z"),
    });
    const danach = absence({
      startDate: new Date("2026-09-10T00:00:00.000Z"),
      endDate: new Date("2026-09-30T00:00:00.000Z"),
    });

    expect(assessStaffing(caregiver(), [visit()], [davor, danach]).issues).toEqual([]);
  });

  it("meldet auch einen Notfall, anders als die beiden anderen Regeln", () => {
    // Regel 2 gibt einen Notfall jeder AKTIVEN Fachkraft. Eine
    // krankgeschriebene ist nicht aktiv-aber-unpassend-eingeteilt, sie ist
    // nicht da: eine Ausnahme, die ihr den Notfall zuteilt, teilt ihn
    // niemandem zu.
    const report = assessStaffing(caregiver(), [visit({ isEmergency: true })], [absence()]);

    expect(report.issues.map((issue) => issue.reason)).toEqual(["absence"]);
  });

  it("sticht den freien Tag und die Qualifikation aus", () => {
    // Wer krankgeschrieben ist, arbeitet auch an seinem Arbeitstag nicht, und
    // ueber die Qualifikation einer Abwesenden zu streiten hilft niemandem.
    const report = assessStaffing(
      caregiver({ qualification: "PFLEGEHILFSKRAFT", workDays: ["MON"] }),
      [visit()],
      [absence()],
    );

    expect(report.issues).toHaveLength(1);
    expect(report.issues[0]?.reason).toBe("absence");
  });

  it("meldet je Besuch, nicht je Tour", () => {
    // Eine Tour laeuft an einem Tag, aber die Zahl in der Uebersicht heisst
    // "so viele Besuche muss ich anfassen" -- und genau so viele Patienten
    // warten.
    const report = assessStaffing(
      caregiver(),
      [visit(), visit({ id: "v-2" }), visit({ id: "v-3" })],
      [absence()],
    );

    expect(report.issues).toHaveLength(3);
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
