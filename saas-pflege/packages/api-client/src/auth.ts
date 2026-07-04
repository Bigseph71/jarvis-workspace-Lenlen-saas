import { apiFetch } from "./client";
import { clearTokens, getApiConfig } from "./config";

// Rollen wie im Backend (lokal gespiegelt, um keine Backend-Pakete in die
// Clients zu ziehen).
export type UserRole = "SUPER_ADMIN" | "STRUKTUR_ADMIN" | "KOORDINATOR" | "HR" | "FACHKRAFT";

export interface AuthUser {
  id: string;
  email: string;
  role: UserRole;
  organizationId: string;
}

interface AuthResult {
  accessToken: string;
  refreshToken: string;
  user: AuthUser;
}

export interface LoginCredentials {
  email: string;
  password: string;
  /** Nur nötig, wenn dieselbe E-Mail in mehreren Organisationen existiert. */
  organizationId?: string;
}

/** Anmeldung: persistiert die Token und liefert den Benutzer. */
export async function login(credentials: LoginCredentials): Promise<AuthUser> {
  const result = await apiFetch<AuthResult>("/auth/login", {
    method: "POST",
    body: credentials,
    auth: false,
  });
  const { storage } = getApiConfig();
  await storage.setAccessToken(result.accessToken);
  await storage.setRefreshToken(result.refreshToken);
  return result.user;
}

/** Abmeldung: widerruft das Refresh-Token (best effort) und leert den Speicher. */
export async function logout(): Promise<void> {
  const { storage } = getApiConfig();
  const refreshToken = await storage.getRefreshToken();
  if (refreshToken) {
    await apiFetch<void>("/auth/logout", {
      method: "POST",
      body: { refreshToken },
      auth: false,
    }).catch(() => undefined);
  }
  await clearTokens();
}

/**
 * Stellt beim App-Start eine Sitzung aus dem Refresh-Token wieder her.
 * Liefert null, wenn kein gültiges Token vorhanden ist.
 */
export async function restoreSession(): Promise<AuthUser | null> {
  const { storage } = getApiConfig();
  const refreshToken = await storage.getRefreshToken();
  if (!refreshToken) return null;
  try {
    const result = await apiFetch<AuthResult>("/auth/refresh", {
      method: "POST",
      body: { refreshToken },
      auth: false,
    });
    await storage.setAccessToken(result.accessToken);
    await storage.setRefreshToken(result.refreshToken);
    return result.user;
  } catch {
    await clearTokens();
    return null;
  }
}
