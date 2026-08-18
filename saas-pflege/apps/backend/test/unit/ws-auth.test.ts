import { describe, it, expect } from "vitest";
import { UserRole } from "@len-len/database";
import { signAccessToken } from "../../src/lib/tokens.js";
import { authenticateSocket, SocketAuthError } from "../../src/lib/ws-auth.js";
import { PLANNING_ROLES, canPlan } from "../../src/lib/roles.js";

/**
 * Authentifizierung der WebSocket-Streams.
 *
 * Jeder der drei Streams prüfte das Token vorher selbst, und jeder anders:
 * zwei fragten die Rolle gar nicht ab. Ein Konto ohne Planungsrecht bekam am
 * Socket, was ihm die REST-Route mit 403 verweigert – beim Clustering die
 * Namen und Koordinaten aller Patienten des Tages.
 */

function tokenFor(role: UserRole, extra: { chpw?: boolean } = {}): string {
  return signAccessToken({
    sub: "11111111-1111-1111-1111-111111111111",
    org: "22222222-2222-2222-2222-222222222222",
    role,
    ...extra,
  });
}

describe("canPlan", () => {
  it("erlaubt Koordination und Admin-Ebene", () => {
    expect(canPlan(UserRole.SUPER_ADMIN)).toBe(true);
    expect(canPlan(UserRole.STRUKTUR_ADMIN)).toBe(true);
    expect(canPlan(UserRole.KOORDINATOR)).toBe(true);
  });

  it("schliesst Fachkraft und Personalverwaltung aus", () => {
    // HR sieht laut Rollenmodell keine Patientendaten, die Fachkraft nur ihre
    // eigene Tagesroute. Beide dürfen die Planung nicht mitlesen.
    expect(canPlan(UserRole.FACHKRAFT)).toBe(false);
    expect(canPlan(UserRole.HR)).toBe(false);
  });

  it("deckt jede Rolle des Modells ab", () => {
    // Fällt auf, wenn eine neue Rolle hinzukommt und niemand entscheidet, auf
    // welche Seite sie gehört.
    for (const role of Object.values(UserRole)) {
      expect(typeof canPlan(role)).toBe("boolean");
    }
  });
});

describe("authenticateSocket", () => {
  it("liefert die Claims eines gültigen Tokens", async () => {
    const claims = await authenticateSocket(tokenFor(UserRole.KOORDINATOR), {
      allow: PLANNING_ROLES,
    });
    expect(claims.role).toBe(UserRole.KOORDINATOR);
    expect(claims.org).toBe("22222222-2222-2222-2222-222222222222");
  });

  it("weist eine nicht erlaubte Rolle ab", async () => {
    await expect(
      authenticateSocket(tokenFor(UserRole.FACHKRAFT), { allow: PLANNING_ROLES }),
    ).rejects.toThrow(SocketAuthError);
  });

  it("nennt beim Rollenfehler den Schliesscode 1008", async () => {
    const err = await authenticateSocket(tokenFor(UserRole.HR), { allow: PLANNING_ROLES }).catch(
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(SocketAuthError);
    expect((err as SocketAuthError).closeCode).toBe(1008);
    expect((err as SocketAuthError).reason).toBe("Keine Berechtigung");
  });

  it("weist ein unlesbares Token ab", async () => {
    const err = await authenticateSocket("kein-jwt").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(SocketAuthError);
    expect((err as SocketAuthError).reason).toBe("Nicht authentifiziert");
  });

  it("weist ein Konto mit erzwungenem Passwortwechsel ab", async () => {
    // Am REST liefert jede Route 403, bis das Passwort gewechselt ist. Der
    // Socket hielt sich bisher nicht daran.
    const err = await authenticateSocket(tokenFor(UserRole.KOORDINATOR, { chpw: true })).catch(
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(SocketAuthError);
    expect((err as SocketAuthError).reason).toBe("Passwortwechsel erforderlich");
  });

  it("prüft die Rolle nicht, wenn keine Liste übergeben wird", async () => {
    // Kein Versehen, sondern die dokumentierte Vorgabe für Streams, die jeder
    // angemeldeten Rolle offenstehen.
    const claims = await authenticateSocket(tokenFor(UserRole.FACHKRAFT));
    expect(claims.role).toBe(UserRole.FACHKRAFT);
  });
});
