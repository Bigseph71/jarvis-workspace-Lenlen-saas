import { describe, it, expect } from "vitest";
import { Locale } from "@len-len/database";
import { grantGpsConsentSchema } from "../../src/modules/consent/consent.schemas.js";
import { GPS_POLICY_VERSION } from "../../src/modules/consent/consent.policy.js";

/**
 * Eingabe der Einwilligungs-Erteilung.
 *
 * Der Kern: die Version wird vom CLIENT gemeldet und nicht serverseitig
 * gesetzt. Nur so ist belegbar, welcher Text tatsächlich auf dem Bildschirm
 * stand. Ein Server, der die Version selbst einträgt, würde jede Zustimmung
 * als Zustimmung zum aktuellen Text verbuchen – auch die einer alten App, die
 * einen ganz anderen Text angezeigt hat.
 */
describe("grantGpsConsentSchema", () => {
  it("nimmt eine Erteilung mit Version und Sprache an", () => {
    const parsed = grantGpsConsentSchema.parse({
      policyVersion: GPS_POLICY_VERSION,
      locale: "FR",
    });
    expect(parsed.policyVersion).toBe(GPS_POLICY_VERSION);
    expect(parsed.locale).toBe(Locale.FR);
  });

  it("setzt DE als Sprache, wenn keine angegeben ist", () => {
    expect(grantGpsConsentSchema.parse({ policyVersion: "2026-01-01" }).locale).toBe(Locale.DE);
  });

  it("verlangt eine Version", () => {
    // Ohne Version wäre nicht feststellbar, wozu eingewilligt wurde.
    expect(() => grantGpsConsentSchema.parse({})).toThrow();
    expect(() => grantGpsConsentSchema.parse({ policyVersion: "" })).toThrow();
  });

  it("lehnt eine unbekannte Sprache ab", () => {
    expect(() => grantGpsConsentSchema.parse({ policyVersion: "x", locale: "ES" })).toThrow();
  });
});

describe("GPS_POLICY_VERSION", () => {
  it("ist gesetzt und nicht leer", () => {
    // Eine leere Version würde jede Einwilligung wertlos machen: sie könnte
    // keinem Text mehr zugeordnet werden.
    expect(GPS_POLICY_VERSION.length).toBeGreaterThan(0);
  });
});
