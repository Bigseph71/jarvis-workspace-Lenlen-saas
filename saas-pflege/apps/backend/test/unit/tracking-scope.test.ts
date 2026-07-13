import { describe, it, expect } from "vitest";
import { UserRole } from "@len-len/database";
import {
  canViewOrgLive,
  positionScope,
  latestPerCaregiver,
} from "../../src/lib/tracking/scope.js";

describe("canViewOrgLive (RLS-Regel: wer sieht die ganze Organisation)", () => {
  it("erlaubt Koordination und Admins", () => {
    expect(canViewOrgLive(UserRole.SUPER_ADMIN)).toBe(true);
    expect(canViewOrgLive(UserRole.STRUKTUR_ADMIN)).toBe(true);
    expect(canViewOrgLive(UserRole.KOORDINATOR)).toBe(true);
  });

  it("verweigert Fachkraft und HR", () => {
    expect(canViewOrgLive(UserRole.FACHKRAFT)).toBe(false);
    expect(canViewOrgLive(UserRole.HR)).toBe(false);
  });
});

describe("positionScope (Fachkraft sieht nur sich selbst)", () => {
  it("beschränkt die Fachkraft auf ihre eigene Position", () => {
    expect(positionScope(UserRole.FACHKRAFT)).toEqual({ ownOnly: true });
  });

  it("gibt der Koordination organisationsweite Sicht", () => {
    expect(positionScope(UserRole.KOORDINATOR)).toEqual({ ownOnly: false });
  });
});

describe("latestPerCaregiver", () => {
  it("behält je Fachkraft nur die jüngste Position (reihenfolgeunabhängig)", () => {
    const rows = [
      { caregiverId: "a", recordedAt: "2026-07-13T10:00:00.000Z", tag: "a-alt" },
      { caregiverId: "b", recordedAt: "2026-07-13T10:05:00.000Z", tag: "b" },
      { caregiverId: "a", recordedAt: "2026-07-13T10:10:00.000Z", tag: "a-neu" },
    ];
    const latest = latestPerCaregiver(rows);
    expect(latest).toHaveLength(2);
    const a = latest.find((r) => r.caregiverId === "a");
    expect(a?.tag).toBe("a-neu");
  });

  it("liefert eine leere Liste für keine Eingabe", () => {
    expect(latestPerCaregiver([])).toEqual([]);
  });
});
