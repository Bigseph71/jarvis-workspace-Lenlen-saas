import { describe, it, expect } from "vitest";
import { formatAppVersion } from "../src/lib/app-version";

/**
 * Anzeige der laufenden Version.
 *
 * Alle bisherigen Builds trugen 0.1.0 und versionCode 1. Meldet eine Fachkraft
 * am Telefon einen Fehler, liess sich nicht sagen, welchen Stand sie
 * installiert hat – und ob der Fehler dort überhaupt noch drin ist.
 */
describe("formatAppVersion", () => {
  it("nennt Version und Build-Nummer", () => {
    expect(formatAppVersion({ version: "0.1.0", build: "7" })).toBe("0.1.0 (7)");
  });

  it("kommt ohne Build-Nummer aus", () => {
    expect(formatAppVersion({ version: "0.1.0", build: null })).toBe("0.1.0");
  });

  it("zeigt nichts an, wenn nichts bekannt ist", () => {
    // Expo Go und Web liefern keine nativen Werte. Eine leere Zeichenkette
    // blendet die Zeile aus; ein Platzhalter sähe aus wie eine echte Version
    // und wäre beim Support irreführend.
    expect(formatAppVersion({ version: null, build: null })).toBe("");
    expect(formatAppVersion({ version: null, build: "7" })).toBe("");
    expect(formatAppVersion({ version: "  ", build: "7" })).toBe("");
  });

  it("räumt Leerzeichen auf", () => {
    expect(formatAppVersion({ version: " 1.2.3 ", build: " 42 " })).toBe("1.2.3 (42)");
    expect(formatAppVersion({ version: "1.2.3", build: "  " })).toBe("1.2.3");
  });
});
