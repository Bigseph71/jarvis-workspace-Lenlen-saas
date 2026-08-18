import { describe, it, expect } from "vitest";
import { shortCommit } from "../../src/lib/health.js";

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
