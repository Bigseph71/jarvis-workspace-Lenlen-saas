import { prisma, withTenant, UserRole, type User } from "@len-len/database";
import { hashPassword, verifyPassword } from "../../lib/password.js";
import {
  signAccessToken,
  generateRefreshToken,
  hashRefreshToken,
  refreshExpiryDate,
} from "../../lib/tokens.js";
import { AppError, ConflictError, UnauthorizedError } from "../../lib/errors.js";
import type {
  RegisterOrganizationInput,
  LoginInput,
} from "./auth.schemas.js";

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface AuthResult extends AuthTokens {
  user: {
    id: string;
    email: string;
    role: UserRole;
    organizationId: string;
  };
}

function toPublicUser(user: User): AuthResult["user"] {
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    organizationId: user.organizationId,
  };
}

/** Erstellt Access- + Refresh-Token und persistiert den Refresh-Hash. */
async function issueTokens(user: User): Promise<AuthTokens> {
  const accessToken = signAccessToken({ sub: user.id, org: user.organizationId, role: user.role });
  const { token: refreshToken, tokenHash } = generateRefreshToken();

  await prisma.refreshToken.create({
    data: {
      userId: user.id,
      tokenHash,
      expiresAt: refreshExpiryDate(),
    },
  });

  return { accessToken, refreshToken };
}

/**
 * Bootstrap einer neuen Organisation samt erstem Struktur-Admin.
 * System-Pfad: läuft ohne Tenant-Kontext (legt den Tenant ja erst an).
 */
export async function registerOrganization(input: RegisterOrganizationInput): Promise<AuthResult> {
  const passwordHash = await hashPassword(input.adminPassword);

  const user = await prisma.$transaction(async (tx) => {
    const org = await tx.organization.create({
      data: { name: input.organizationName, country: input.country },
    });

    return tx.user.create({
      data: {
        organizationId: org.id,
        role: UserRole.STRUKTUR_ADMIN,
        email: input.adminEmail,
        passwordHash,
      },
    });
  });

  const tokens = await issueTokens(user);
  return { ...tokens, user: toPublicUser(user) };
}

/**
 * Login per E-Mail + Passwort. E-Mail ist nur pro Tenant eindeutig; existiert
 * sie in mehreren Organisationen, ist organizationId zur Auflösung nötig.
 */
export async function login(input: LoginInput): Promise<AuthResult> {
  const candidates = await prisma.user.findMany({
    where: {
      email: input.email,
      isActive: true,
      ...(input.organizationId ? { organizationId: input.organizationId } : {}),
    },
  });

  if (candidates.length > 1) {
    throw new ConflictError("E-Mail in mehreren Organisationen vorhanden – organizationId angeben.");
  }

  const user = candidates[0];
  // Generische Meldung gegen User-Enumeration. Passwort trotzdem gegen einen
  // Dummy-Hash prüfen, um Timing-Unterschiede zu vermeiden.
  const ok = user
    ? await verifyPassword(user.passwordHash, input.password)
    : await verifyPassword(
        "$argon2id$v=19$m=19456,t=2,p=1$c29tZXNhbHQ$3vN5cQ6Yb0Qm5h0Yb0Qm5h0Yb0Qm5h0Yb0Qm5h0Yb0",
        input.password,
      ).catch(() => false);

  if (!user || !ok) {
    throw new UnauthorizedError("Ungültige Anmeldedaten");
  }

  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

  const tokens = await issueTokens(user);
  return { ...tokens, user: toPublicUser(user) };
}

/**
 * Rotiert ein Refresh-Token. Erkennt Wiederverwendung: wird ein bereits
 * widerrufenes Token erneut präsentiert, werden ALLE Tokens des Users
 * widerrufen (mögliches Token-Leak).
 */
export async function rotateRefreshToken(rawToken: string): Promise<AuthResult> {
  const tokenHash = hashRefreshToken(rawToken);
  const existing = await prisma.refreshToken.findUnique({
    where: { tokenHash },
    include: { user: true },
  });

  if (!existing) {
    throw new UnauthorizedError("Refresh-Token unbekannt");
  }

  // Wiederverwendung eines widerrufenen Tokens -> Notfall: alles widerrufen.
  if (existing.revokedAt) {
    await prisma.refreshToken.updateMany({
      where: { userId: existing.userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    throw new UnauthorizedError("Refresh-Token wiederverwendet – Sitzung beendet");
  }

  if (existing.expiresAt.getTime() < Date.now()) {
    throw new UnauthorizedError("Refresh-Token abgelaufen");
  }

  if (!existing.user.isActive) {
    throw new UnauthorizedError("Konto deaktiviert");
  }

  // Rotation: altes Token widerrufen, neues Paar ausgeben (atomar).
  const { user } = existing;
  const accessToken = signAccessToken({ sub: user.id, org: user.organizationId, role: user.role });
  const next = generateRefreshToken();

  await prisma.$transaction([
    prisma.refreshToken.update({
      where: { id: existing.id },
      data: { revokedAt: new Date() },
    }),
    prisma.refreshToken.create({
      data: { userId: user.id, tokenHash: next.tokenHash, expiresAt: refreshExpiryDate() },
    }),
  ]);

  return { accessToken, refreshToken: next.token, user: toPublicUser(user) };
}

/** Logout: widerruft das übergebene Refresh-Token (idempotent). */
export async function logout(rawToken: string): Promise<void> {
  const tokenHash = hashRefreshToken(rawToken);
  await prisma.refreshToken.updateMany({
    where: { tokenHash, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

/**
 * Profil des eingeloggten Users – bewusst über withTenant gelesen, damit die
 * RLS-Policy (app.current_org) greift. Demonstriert den Tenant-Pfad.
 */
export async function getProfile(userId: string, organizationId: string) {
  return withTenant(organizationId, async (tx) => {
    const user = await tx.user.findFirst({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        role: true,
        organizationId: true,
        language: true,
        mfaEnabled: true,
        lastLoginAt: true,
      },
    });
    if (!user) throw new AppError(404, "Benutzer nicht gefunden", "NotFound");
    return user;
  });
}
