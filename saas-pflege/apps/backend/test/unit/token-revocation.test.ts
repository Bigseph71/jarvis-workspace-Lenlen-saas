import { describe, expect, it } from "vitest";
import { isIssuedBeforeCutoff } from "../../src/lib/token-revocation.js";

const T = 1_785_500_000; // beliebiger Unix-Zeitstempel in Sekunden

describe("isIssuedBeforeCutoff", () => {
  it("lässt alles durch, solange keine Sperre existiert", () => {
    expect(isIssuedBeforeCutoff(T, null)).toBe(false);
    expect(isIssuedBeforeCutoff(undefined, null)).toBe(false);
  });

  it("widerruft Token, die vor der Sperre ausgestellt wurden", () => {
    expect(isIssuedBeforeCutoff(T - 1, T)).toBe(true);
    expect(isIssuedBeforeCutoff(T - 900, T)).toBe(true);
  });

  it("lässt Token durch, die nach der Sperre ausgestellt wurden", () => {
    expect(isIssuedBeforeCutoff(T + 1, T)).toBe(false);
    expect(isIssuedBeforeCutoff(T + 900, T)).toBe(false);
  });

  it("lässt das Token derselben Sekunde gelten", () => {
    // Entscheidend: changePassword setzt die Sperre und gibt unmittelbar danach
    // ein neues Token aus. Bei sekundengenauem Vergleich fallen beide oft in
    // dieselbe Sekunde – ein nicht-strikter Vergleich würde das frische Token
    // sofort wieder entwerten.
    expect(isIssuedBeforeCutoff(T, T)).toBe(false);
  });

  it("widerruft Token ohne iat, sobald eine Sperre besteht (fail closed)", () => {
    expect(isIssuedBeforeCutoff(undefined, T)).toBe(true);
  });
});
