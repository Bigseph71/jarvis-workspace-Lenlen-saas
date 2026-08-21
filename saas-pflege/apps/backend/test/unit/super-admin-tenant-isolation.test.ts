import { describe, it, expect } from "vitest";
import { UserRole } from "@len-len/database";
import { canPlan, PLANNING_ROLES } from "../../src/lib/roles.js";
import { canViewOrgLive, positionScope } from "../../src/lib/tracking/scope.js";

/**
 * Der Super-Admin sieht keine Daten eines Tenants.
 *
 * Datenminimierung: wer die Plattform betreibt, braucht weder Patienten noch
 * Fachkräfte, Verträge, Standorte oder Nachrichten eines Kunden. Sein Bereich
 * ist /admin – Organisationen, Abrechnung, Audit-Log.
 *
 * Diese Datei prüft die gemeinsamen Rollenlisten. Was einzelne Routen
 * zulassen, steht in ihren eigenen requireRole-Aufrufen; die Zusicherung, die
 * hier festgehalten wird, ist die Regel dahinter.
 */
describe("Super-Admin und Tenant-Daten", () => {
  it("steht in keiner Planungs-Rolle", () => {
    expect(PLANNING_ROLES).not.toContain(UserRole.SUPER_ADMIN);
    expect(canPlan(UserRole.SUPER_ADMIN)).toBe(false);
  });

  it("sieht keine Live-Standorte", () => {
    expect(canViewOrgLive(UserRole.SUPER_ADMIN)).toBe(false);
  });

  it("bekommt auch keinen eingeschränkten Standort-Zugriff", () => {
    // positionScope kennt nur "alles" oder "nur die eigene Fachkraft". Da er
    // keine Fachkraft IST, liefe der zweite Fall ins Leere – geprüft wird
    // hier, dass er jedenfalls nicht organisationsweit sieht.
    expect(positionScope(UserRole.SUPER_ADMIN).ownOnly).toBe(true);
  });

  it("lässt die Rollen unberührt, die im Tenant arbeiten", () => {
    // Die Trennung darf niemandem sonst etwas wegnehmen.
    expect(canPlan(UserRole.STRUKTUR_ADMIN)).toBe(true);
    expect(canPlan(UserRole.KOORDINATOR)).toBe(true);
    expect(canViewOrgLive(UserRole.STRUKTUR_ADMIN)).toBe(true);
    expect(canViewOrgLive(UserRole.KOORDINATOR)).toBe(true);
  });
});
