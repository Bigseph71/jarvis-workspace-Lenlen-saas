import { describe, it, expect, beforeAll } from "vitest";
import { isInvitationUsable, type InvitationState } from "../../src/modules/users/invitation.rules.js";

/**
 * Einladungslinks – die Regel, wann einer noch zieht.
 *
 * Sie entscheidet über einen Zugang zu einem Konto und ist deshalb hier
 * einzeln festgehalten, nicht nur im Integrationstest: fällt eine der vier
 * Bedingungen still weg, öffnet ein alter Link wieder ein Konto, und im
 * Betrieb fiele das niemandem auf.
 */

const NOW = new Date("2026-09-18T12:00:00.000Z");

function state(overrides: Partial<InvitationState> = {}): InvitationState {
  return {
    usedAt: null,
    expiresAt: new Date("2026-09-25T12:00:00.000Z"),
    user: { isActive: true },
    organization: { deletedAt: null },
    ...overrides,
  };
}

describe("Einladungslink", () => {
  it("gilt, solange er offen, unverbraucht und das Konto aktiv ist", () => {
    expect(isInvitationUsable(state(), NOW)).toBe(true);
  });

  it("gilt nicht mehr, wenn er bereits eingelöst wurde", () => {
    // Sonst liesse sich ein weitergeleiteter Link ein zweites Mal benutzen,
    // nachdem die Fachkraft ihr Passwort gesetzt hat.
    expect(isInvitationUsable(state({ usedAt: new Date() }), NOW)).toBe(false);
  });

  it("gilt nicht mehr nach Ablauf", () => {
    const abgelaufen = state({ expiresAt: new Date("2026-09-18T11:59:59.000Z") });
    expect(isInvitationUsable(abgelaufen, NOW)).toBe(false);
  });

  it("gilt in der Sekunde des Ablaufs nicht mehr", () => {
    // Strikt grösser: ein Link, der "jetzt" abläuft, ist abgelaufen.
    expect(isInvitationUsable(state({ expiresAt: NOW }), NOW)).toBe(false);
  });

  it("gilt nicht für ein deaktiviertes Konto", () => {
    // Sonst bekäme eine ausgeschiedene Fachkraft über einen alten Link
    // wieder Zugang.
    expect(isInvitationUsable(state({ user: { isActive: false } }), NOW)).toBe(false);
  });

  it("gilt nicht in einer gelöschten Organisation", () => {
    // Die Anmeldung weist gelöschte Organisationen ab; ein Einladungslink
    // wäre sonst der Weg daran vorbei.
    const gelöscht = state({ organization: { deletedAt: new Date("2026-09-01T00:00:00.000Z") } });
    expect(isInvitationUsable(gelöscht, NOW)).toBe(false);
  });

  it("gilt nicht, wenn es die Einladung gar nicht gibt", () => {
    // Erfundenes Token: dieselbe Antwort wie bei abgelaufen, der Aufrufer
    // erfährt den Unterschied nicht.
    expect(isInvitationUsable(null, NOW)).toBe(false);
  });
});

describe("Einladungs-Token", () => {
  // Der Hash hängt an env.JWT_REFRESH_SECRET – das Modul erst laden, wenn die
  // Umgebung steht (wie in den übrigen Token-Tests).
  let hashInvitationToken: (token: string) => string;
  let hashRefreshToken: (token: string) => string;

  beforeAll(async () => {
    ({ hashInvitationToken } = await import("../../src/lib/invitation.js"));
    ({ hashRefreshToken } = await import("../../src/lib/tokens.js"));
  });

  it("hasht denselben Wert stabil", () => {
    expect(hashInvitationToken("abc")).toBe(hashInvitationToken("abc"));
  });

  it("trennt die Verwendungszwecke", () => {
    // Beide Token-Arten teilen sich ein Secret. Ohne die Domänentrennung
    // ("invitation:") ergäbe ein Einladungs-Token denselben Hash wie ein
    // gleichlautendes Refresh-Token – und wäre damit gegen die falsche
    // Tabelle einlösbar.
    expect(hashInvitationToken("abc")).not.toBe(hashRefreshToken("abc"));
  });

  it("liefert einen Hex-Hash ohne Spur des Klartexts", () => {
    const hash = hashInvitationToken("geheim-12345");
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).not.toContain("geheim");
  });
});
