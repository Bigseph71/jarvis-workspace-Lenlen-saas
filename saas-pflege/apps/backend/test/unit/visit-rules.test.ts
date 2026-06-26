import { describe, it, expect } from "vitest";
import { workDaysOf, isWorkDay, sameQualification } from "../../src/modules/visits/visit.rules.js";
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
