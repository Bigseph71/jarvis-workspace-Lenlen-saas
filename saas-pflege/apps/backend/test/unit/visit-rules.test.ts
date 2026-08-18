import { describe, it, expect } from "vitest";
import {
  workDaysOf,
  isWorkDay,
  sameQualification,
  enforcesStammRules,
} from "../../src/modules/visits/visit.rules.js";
import type { Qualification } from "@len-len/database";

const MONDAY = new Date(Date.UTC(2026, 0, 5)); // Montag
const TUESDAY = new Date(Date.UTC(2026, 0, 6)); // Dienstag

describe("workDaysOf", () => {
  it("liefert das Array oder [] bei ungültigem JSON", () => {
    expect(workDaysOf({ workDays: ["MON", "WED"] })).toEqual(["MON", "WED"]);
    expect(workDaysOf({ workDays: null })).toEqual([]);
    expect(workDaysOf({ workDays: "MON" })).toEqual([]);
  });
});

describe("isWorkDay (Regel métier 5)", () => {
  it("true nur wenn der Wochentag im Vertrag steht", () => {
    expect(isWorkDay({ workDays: ["MON", "WED"] }, MONDAY)).toBe(true);
    expect(isWorkDay({ workDays: ["MON", "WED"] }, TUESDAY)).toBe(false);
    expect(isWorkDay({ workDays: [] }, MONDAY)).toBe(false);
  });
});

describe("sameQualification (Regel métier 4)", () => {
  it("vergleicht die Qualifikation der Vertretung", () => {
    const pfk = "PFLEGEFACHKRAFT" as Qualification;
    const hilfe = "PFLEGEHILFSKRAFT" as Qualification;
    expect(sameQualification(pfk, pfk)).toBe(true);
    expect(sameQualification(pfk, hilfe)).toBe(false);
  });
});

describe("enforcesStammRules (Regel métier 2 vs 4)", () => {
  const STAMM = "11111111-1111-1111-1111-111111111111";

  it("prüft den Regelbesuch gegen die Stamm-Fachkraft", () => {
    expect(enforcesStammRules({ isEmergency: false, assignedCaregiverId: STAMM })).toBe(true);
  });

  it("lässt den Notfall frei, auch wenn der Patient eine Stamm-Fachkraft hat", () => {
    // Der Kern: createEmergencyVisit erlaubt jede aktive Fachkraft. Prüfte das
    // Nachzuweisen strenger, bliebe ein Notfall ohne Fachkraft für immer ohne –
    // und damit in keiner Tagesroute sichtbar.
    expect(enforcesStammRules({ isEmergency: true, assignedCaregiverId: STAMM })).toBe(false);
  });

  it("hat ohne Stamm-Fachkraft nichts zu vergleichen", () => {
    expect(enforcesStammRules({ isEmergency: false, assignedCaregiverId: null })).toBe(false);
  });
});
