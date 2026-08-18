import { describe, it, expect } from "vitest";
import { resolveApiBaseUrl, DEV_FALLBACK_API_URL } from "../src/lib/api-url";

/**
 * Auflösung der API-Adresse.
 *
 * Das EAS-Profil "production" trug EXPO_PUBLIC_API_URL nicht, und der Code
 * fiel still auf http://localhost:4000 zurück – auf einem Telefon ist das das
 * Telefon selbst. Ein Produktions-Build liess sich also erzeugen, installieren
 * und öffnen, und lief bei jedem Aufruf in eine Zeitüberschreitung, ohne einen
 * Hinweis auf die Ursache. Aufgefallen wäre das beim ersten Build für einen
 * Kunden.
 *
 * Dieselbe Falle hatte das Web schon (PR #26/#27): ein zur Bauzeit
 * eingesetzter Wert mit stillem Rückfall. Dort scheitert der Build seitdem
 * absichtlich. Hier ist das Gegenstück der harte Fehler im Release.
 */
describe("resolveApiBaseUrl", () => {
  it("nimmt den konfigurierten Wert", () => {
    expect(resolveApiBaseUrl({ configured: "https://api.example.de", isDev: false })).toBe(
      "https://api.example.de",
    );
  });

  it("räumt Leerzeichen auf", () => {
    expect(resolveApiBaseUrl({ configured: "  https://api.example.de  ", isDev: true })).toBe(
      "https://api.example.de",
    );
  });

  it("erlaubt in der Entwicklung den Rückfall auf localhost", () => {
    expect(resolveApiBaseUrl({ configured: undefined, isDev: true })).toBe(DEV_FALLBACK_API_URL);
  });

  it("scheitert im Release-Build, wenn die Adresse fehlt", () => {
    // Der Kern: lieber ein klarer Fehler als eine App, die arbeitet zu tun
    // scheint und niemanden erreicht.
    expect(() => resolveApiBaseUrl({ configured: undefined, isDev: false })).toThrow(
      /EXPO_PUBLIC_API_URL/,
    );
  });

  it("behandelt eine leere Variable wie eine fehlende", () => {
    // Ein leerer String ist in CI-Konfigurationen der häufigste Fall: die
    // Variable ist gesetzt, aber ohne Wert.
    expect(() => resolveApiBaseUrl({ configured: "", isDev: false })).toThrow();
    expect(() => resolveApiBaseUrl({ configured: "   ", isDev: false })).toThrow();
  });
});
