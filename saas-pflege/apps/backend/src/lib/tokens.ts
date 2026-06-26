import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import jwt from "jsonwebtoken";
import type { UserRole } from "@len-len/database";
import { env } from "../config/env.js";
import { UnauthorizedError } from "./errors.js";

// ── Access Token (JWT, kurzlebig) ────────────────────────────────────────

export interface AccessTokenClaims {
  /** userId */
  sub: string;
  /** organizationId – trägt den Tenant durch jeden Request */
  org: string;
  role: UserRole;
}

export function signAccessToken(claims: AccessTokenClaims): string {
  const { sub, ...rest } = claims;
  return jwt.sign(rest, env.JWT_ACCESS_SECRET, {
    subject: sub,
    expiresIn: env.JWT_ACCESS_TTL as jwt.SignOptions["expiresIn"],
    algorithm: "HS256",
  });
}

export function verifyAccessToken(token: string): AccessTokenClaims {
  try {
    const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET, { algorithms: ["HS256"] });
    if (typeof decoded === "string" || !decoded.sub) {
      throw new UnauthorizedError("Token ungültig");
    }
    return {
      sub: decoded.sub,
      org: (decoded as jwt.JwtPayload).org as string,
      role: (decoded as jwt.JwtPayload).role as UserRole,
    };
  } catch {
    throw new UnauthorizedError("Token ungültig oder abgelaufen");
  }
}

// ── Refresh Token (opak, gepfeffert gehasht) ─────────────────────────────

export interface GeneratedRefreshToken {
  /** Klartext-Token – wird nur einmal an den Client zurückgegeben */
  token: string;
  /** HMAC-Hash – nur dieser landet in der DB */
  tokenHash: string;
}

/** Erzeugt ein neues opakes Refresh-Token und dessen DB-Hash. */
export function generateRefreshToken(): GeneratedRefreshToken {
  const token = randomBytes(48).toString("base64url");
  return { token, tokenHash: hashRefreshToken(token) };
}

/** HMAC-SHA256 mit Pepper: DB-Leak der Hashes ist ohne das Secret nutzlos. */
export function hashRefreshToken(token: string): string {
  return createHmac("sha256", env.JWT_REFRESH_SECRET).update(token).digest("hex");
}

/** Zeitkonstanter Vergleich zweier Hex-Hashes. */
export function safeHashEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "hex");
  const bufB = Buffer.from(b, "hex");
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}

// ── Dauer-Parser ("15m", "7d", "30s", "12h") → Millisekunden ─────────────

export function parseDurationMs(value: string): number {
  const match = /^(\d+)\s*(s|m|h|d)$/.exec(value.trim());
  if (!match) throw new Error(`Ungültige Dauer: ${value}`);
  const amount = Number(match[1]);
  const unit = match[2] as "s" | "m" | "h" | "d";
  const factors: Record<"s" | "m" | "h" | "d", number> = {
    s: 1000,
    m: 60_000,
    h: 3_600_000,
    d: 86_400_000,
  };
  return amount * factors[unit];
}

export function refreshExpiryDate(): Date {
  return new Date(Date.now() + parseDurationMs(env.JWT_REFRESH_TTL));
}
