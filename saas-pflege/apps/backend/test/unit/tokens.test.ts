import { describe, it, expect } from "vitest";
import {
  parseDurationMs,
  generateRefreshToken,
  hashRefreshToken,
  safeHashEqual,
  signAccessToken,
  verifyAccessToken,
} from "../../src/lib/tokens.js";

describe("parseDurationMs", () => {
  it("parst gängige Dauern", () => {
    expect(parseDurationMs("30s")).toBe(30_000);
    expect(parseDurationMs("15m")).toBe(900_000);
    expect(parseDurationMs("12h")).toBe(43_200_000);
    expect(parseDurationMs("7d")).toBe(604_800_000);
  });

  it("wirft bei ungültigem Format", () => {
    expect(() => parseDurationMs("abc")).toThrow();
    expect(() => parseDurationMs("10")).toThrow();
    expect(() => parseDurationMs("10w")).toThrow();
  });
});

describe("refresh tokens", () => {
  it("erzeugt Token + deterministischen, gepfefferten Hash", () => {
    const { token, tokenHash } = generateRefreshToken();
    expect(token).toBeTruthy();
    expect(tokenHash).toBe(hashRefreshToken(token));
    // Hash != Klartext (kein Leak)
    expect(tokenHash).not.toBe(token);
  });

  it("safeHashEqual vergleicht zeitkonstant korrekt", () => {
    const a = hashRefreshToken("foo");
    expect(safeHashEqual(a, a)).toBe(true);
    expect(safeHashEqual(a, hashRefreshToken("bar"))).toBe(false);
  });
});

describe("access tokens", () => {
  it("Round-Trip: sign -> verify erhält die Claims", () => {
    const token = signAccessToken({ sub: "user-1", org: "org-1", role: "KOORDINATOR" as never });
    const claims = verifyAccessToken(token);
    expect(claims.sub).toBe("user-1");
    expect(claims.org).toBe("org-1");
    expect(claims.role).toBe("KOORDINATOR");
  });

  it("wirft UnauthorizedError bei manipuliertem Token", () => {
    expect(() => verifyAccessToken("not.a.jwt")).toThrow();
  });
});
