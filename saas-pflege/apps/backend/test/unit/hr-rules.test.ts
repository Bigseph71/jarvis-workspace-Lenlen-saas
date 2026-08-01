import { describe, it, expect } from "vitest";
import {
  absenceViolations,
  activeAt,
  contractViolations,
  findOverlap,
  formatMinutes,
  netWorkMinutes,
  parseTimeToMinutes,
  periodsOverlap,
  requiredBreakMinutes,
  scheduleViolations,
  type ContractRule,
} from "../../src/modules/hr/hr.rules.js";

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

// 2026-08-03 ist ein Montag.
const MONDAY = d("2026-08-03");
const SATURDAY = d("2026-08-08");

const contract: ContractRule = {
  workDays: ["MON", "TUE", "WED", "THU", "FRI"],
  weeklyHours: 40,
};

describe("periodsOverlap", () => {
  it("erkennt Überschneidungen bei geschlossenen Zeiträumen", () => {
    expect(
      periodsOverlap({ start: d("2026-01-01"), end: d("2026-06-30") }, { start: d("2026-06-01"), end: d("2026-12-31") }),
    ).toBe(true);
  });

  it("berührende Ränder gelten als Überschneidung (Ende einschließend)", () => {
    expect(
      periodsOverlap({ start: d("2026-01-01"), end: d("2026-06-30") }, { start: d("2026-06-30"), end: null }),
    ).toBe(true);
  });

  it("getrennte Zeiträume überschneiden sich nicht", () => {
    expect(
      periodsOverlap({ start: d("2026-01-01"), end: d("2026-06-29") }, { start: d("2026-06-30"), end: null }),
    ).toBe(false);
  });

  it("ein offener Zeitraum schluckt alles danach", () => {
    expect(
      periodsOverlap({ start: d("2026-01-01"), end: null }, { start: d("2030-01-01"), end: null }),
    ).toBe(true);
  });
});

describe("findOverlap / activeAt", () => {
  const periods = [
    { id: "a", start: d("2025-01-01"), end: d("2025-12-31") },
    { id: "b", start: d("2026-01-01"), end: null },
  ];

  it("findet den kollidierenden Zeitraum", () => {
    expect(findOverlap(periods, { start: d("2025-06-01"), end: d("2025-07-01") })?.id).toBe("a");
    expect(findOverlap(periods, { start: d("2024-01-01"), end: d("2024-12-31") })).toBeUndefined();
  });

  it("liefert den zum Stichtag geltenden Zeitraum", () => {
    expect(activeAt(periods, d("2025-06-01"))?.id).toBe("a");
    expect(activeAt(periods, d("2027-06-01"))?.id).toBe("b");
    expect(activeAt(periods, d("2024-06-01"))).toBeUndefined();
  });
});

describe("Uhrzeiten", () => {
  it("parst HH:MM in Minuten", () => {
    expect(parseTimeToMinutes("08:30")).toBe(510);
    expect(parseTimeToMinutes("00:00")).toBe(0);
    expect(parseTimeToMinutes("23:59")).toBe(1439);
  });

  it("liefert null statt zu werfen – der CSV-Import braucht ein Zeilen-Nein", () => {
    expect(parseTimeToMinutes("24:00")).toBeNull();
    expect(parseTimeToMinutes("8:30")).toBeNull();
    expect(parseTimeToMinutes("08:60")).toBeNull();
    expect(parseTimeToMinutes("acht Uhr")).toBeNull();
  });

  it("formatiert zurück", () => {
    expect(formatMinutes(510)).toBe("08:30");
    expect(formatMinutes(0)).toBe("00:00");
  });
});

describe("netWorkMinutes / requiredBreakMinutes", () => {
  it("zieht die Pause ab und wird nie negativ", () => {
    expect(netWorkMinutes({ startMinute: 480, endMinute: 960, breakMinutes: 30 })).toBe(450);
    expect(netWorkMinutes({ startMinute: 480, endMinute: 500, breakMinutes: 60 })).toBe(0);
  });

  it("ArbZG §4: 30 min ab 6 h, 45 min ab 9 h", () => {
    expect(requiredBreakMinutes(6 * 60)).toBe(0);
    expect(requiredBreakMinutes(6 * 60 + 1)).toBe(30);
    expect(requiredBreakMinutes(9 * 60)).toBe(30);
    expect(requiredBreakMinutes(9 * 60 + 1)).toBe(45);
  });
});

describe("scheduleViolations (Regel métier 5)", () => {
  const shift = { date: MONDAY, startMinute: 480, endMinute: 960, breakMinutes: 30 }; // 08:00-16:00

  it("akzeptiert eine reguläre Schicht am Vertragstag", () => {
    expect(scheduleViolations(shift, contract)).toEqual([]);
  });

  it("weist ein Ende vor dem Beginn ab und prüft nicht weiter", () => {
    const result = scheduleViolations({ ...shift, endMinute: 400 }, contract);
    expect(result).toEqual(["Ende muss nach dem Beginn liegen"]);
  });

  it("weist eine Pause ab, die länger als die Schicht ist", () => {
    const result = scheduleViolations({ ...shift, breakMinutes: 600 }, contract);
    expect(result).toEqual(["Pause ist länger als die Schicht"]);
  });

  it("meldet die Tageshöchstarbeitszeit", () => {
    // 06:00-17:30 abzüglich 45 min = 10:45 netto
    const result = scheduleViolations(
      { date: MONDAY, startMinute: 360, endMinute: 1050, breakMinutes: 45 },
      contract,
    );
    expect(result.some((r) => r.includes("Tageshöchstarbeitszeit"))).toBe(true);
  });

  it("meldet eine zu kurze Pause", () => {
    const result = scheduleViolations({ ...shift, breakMinutes: 15 }, contract);
    expect(result.some((r) => r.includes("Mindestpause"))).toBe(true);
  });

  it("weist einen Tag außerhalb der Vertragstage ab", () => {
    const result = scheduleViolations({ ...shift, date: SATURDAY }, contract);
    expect(result).toContain("SAT ist kein vertraglicher Arbeitstag");
  });

  it("weist ohne geltenden Vertrag ab", () => {
    expect(scheduleViolations(shift, null)).toEqual(["Kein gültiger Vertrag zu diesem Datum"]);
  });

  it("meldet die Überschreitung der Wochenarbeitszeit", () => {
    // 37:30 bereits verplant + 7:30 dieser Schicht > 40 h
    const result = scheduleViolations(shift, contract, 37.5 * 60);
    expect(result.some((r) => r.includes("Wochenarbeitszeit"))).toBe(true);
  });

  it("lässt die Woche bis exakt zur Vertragsgrenze zu", () => {
    // 32:30 + 7:30 = 40:00
    expect(scheduleViolations(shift, contract, 32.5 * 60)).toEqual([]);
  });
});

describe("absenceViolations", () => {
  it("akzeptiert eine freie Periode", () => {
    expect(absenceViolations({ startDate: d("2026-08-03"), endDate: d("2026-08-07") })).toEqual([]);
  });

  it("weist ein Ende vor dem Start ab", () => {
    expect(
      absenceViolations({ startDate: d("2026-08-07"), endDate: d("2026-08-03") }),
    ).toEqual(["Enddatum liegt vor dem Startdatum"]);
  });

  it("weist Überschneidungen mit bestehenden Abwesenheiten ab", () => {
    const existing = [{ start: d("2026-08-05"), end: d("2026-08-10") }];
    expect(
      absenceViolations({ startDate: d("2026-08-03"), endDate: d("2026-08-06") }, existing),
    ).toEqual(["Überschneidet eine bestehende Abwesenheit"]);
  });

  it("erlaubt eine Abwesenheit direkt nach einer anderen", () => {
    const existing = [{ start: d("2026-08-01"), end: d("2026-08-02") }];
    expect(
      absenceViolations({ startDate: d("2026-08-03"), endDate: d("2026-08-06") }, existing),
    ).toEqual([]);
  });
});

describe("contractViolations", () => {
  it("weist ein Ende vor dem Beginn ab", () => {
    expect(
      contractViolations({ start: d("2026-08-01"), end: d("2026-07-01") }),
    ).toEqual(["Vertragsende liegt vor dem Vertragsbeginn"]);
  });

  it("weist überlappende Verträge derselben Fachkraft ab", () => {
    const existing = [{ start: d("2026-01-01"), end: null }];
    expect(contractViolations({ start: d("2026-06-01"), end: null }, existing)).toEqual([
      "Überschneidet einen bestehenden Vertrag derselben Fachkraft",
    ]);
  });

  it("erlaubt einen Anschlussvertrag ab dem Folgetag", () => {
    const existing = [{ start: d("2026-01-01"), end: d("2026-06-30") }];
    expect(contractViolations({ start: d("2026-07-01"), end: null }, existing)).toEqual([]);
  });
});
