import { describe, it, expect } from "vitest";
import { config } from "../src/middleware";

/**
 * Der Health-Check darf nicht ins Sprach-Routing geraten.
 *
 * next-intl leitet jeden erfassten Pfad ohne Sprachsegment auf die
 * Standardsprache um. Fuer /health hiesse das 307 -> /de/health, und ein
 * Ueberwachungssystem, das Weiterleitungen nicht folgt, meldete den Dienst als
 * ausgefallen - obwohl er laeuft. Der Matcher wird deshalb hier festgehalten
 * und nicht nur im Kommentar erklaert.
 */

/** Bildet die Matcher-Auswertung von Next nach: greift der Ausdruck? */
function matched(pathname: string): boolean {
  return config.matcher.some((pattern) => new RegExp(`^${pattern}$`).test(pathname));
}

describe("Middleware-Matcher", () => {
  it("laesst /health aus", () => {
    expect(matched("/health")).toBe(false);
  });

  it("erfasst weiterhin die Seiten, die ein Sprachsegment brauchen", () => {
    // Sonst waere die Ausnahme zu weit geraten und das Sprach-Routing tot.
    for (const path of ["/", "/dashboard", "/de/dashboard", "/visits", "/planung"]) {
      expect(matched(path), path).toBe(true);
    }
  });

  it("laesst API, Next-Internals und Dateien weiter aus", () => {
    for (const path of ["/api/x", "/_next/static/a.js", "/_vercel/y", "/favicon.ico"]) {
      expect(matched(path), path).toBe(false);
    }
  });

  it("erfasst eine Seite, deren Name mit health beginnt", () => {
    // Die Ausnahme gilt dem Pfad /health, nicht jedem Wort, das so anfaengt.
    // Ohne diesen Test faellt eine spaetere Seite /healthcare stillschweigend
    // aus dem Sprach-Routing.
    expect(matched("/healthcare")).toBe(true);
  });
});
