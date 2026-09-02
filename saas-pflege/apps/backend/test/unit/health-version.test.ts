import { describe, it, expect } from "vitest";
import { shortCommit, slowChecks, SLOW_CHECK_MS } from "../../src/lib/health.js";

/**
 * Version im Health-Check.
 *
 * Nach einem Merge liess sich von aussen nicht mehr feststellen, welcher Stand
 * läuft: /metrics ist zu (und war die einzige Auskunft), /health schwieg. Beim
 * ersten Fehlerbericht eines Kunden ist das die erste Frage.
 */
describe("shortCommit", () => {
  it("kürzt auf die sieben Zeichen von git log --oneline", () => {
    expect(shortCommit("36a4cb4f1e2d3c4b5a6978899aabbccddeeff001")).toBe("36a4cb4");
  });

  it("nennt 'unknown', wenn der Hoster nichts liefert", () => {
    // Lokal und in Tests gibt es keinen Commit. Ein leeres Feld wäre schlimmer
    // als ein ehrliches "unknown": es sähe aus wie eine Version.
    expect(shortCommit(undefined)).toBe("unknown");
    expect(shortCommit("")).toBe("unknown");
    expect(shortCommit("   ")).toBe("unknown");
  });

  it("lässt einen bereits kurzen Wert unverändert", () => {
    expect(shortCommit("abc123")).toBe("abc123");
  });
});

/**
 * Dauer der Prüfungen im Health-Check.
 *
 * Anlass: von aussen war zu sehen, DASS /health rund eine Sekunde braucht, aber
 * nicht wofür. Beide Prüfungen laufen parallel und meldeten nur "up" – die
 * Gesamtdauer ist das Maximum von zweien, und welche der beiden es ist, blieb
 * offen. Genau diese Frage soll `timings` beantworten.
 */
describe("slowChecks", () => {
  const fast = { database: 4, redis: 3, total: 5 };

  it("schweigt, solange beide Abhängigkeiten schnell antworten", () => {
    expect(slowChecks(fast)).toEqual([]);
  });

  it("benennt die Datenbank, wenn sie über der Schwelle liegt", () => {
    expect(slowChecks({ database: 830, redis: 3, total: 831 })).toEqual(["database"]);
  });

  it("benennt Redis, wenn es über der Schwelle liegt", () => {
    expect(slowChecks({ database: 4, redis: 830, total: 831 })).toEqual(["redis"]);
  });

  it("benennt beide, wenn beide träge sind", () => {
    expect(slowChecks({ database: 500, redis: 600, total: 610 })).toEqual(["database", "redis"]);
  });

  it("die Schwelle ist eine Obergrenze, kein Mindestwert", () => {
    // Genau auf der Schwelle ist noch nicht träge; ein Wert darüber schon.
    expect(slowChecks({ database: SLOW_CHECK_MS, redis: 1, total: 1 })).toEqual([]);
    expect(slowChecks({ database: SLOW_CHECK_MS + 1, redis: 1, total: 1 })).toEqual(["database"]);
  });

  it("nimmt eine eigene Schwelle entgegen", () => {
    expect(slowChecks(fast, 2)).toEqual(["database", "redis"]);
  });
});
