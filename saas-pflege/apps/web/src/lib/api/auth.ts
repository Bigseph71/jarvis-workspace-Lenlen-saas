import { apiFetch } from "./client";
import { clearTokens, getRefreshToken, setAccessToken, setRefreshToken } from "../auth/tokens";

// Rollen wie im Backend (lokal gespiegelt, um keine Backend-Pakete ins
// Frontend zu ziehen).
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
  setAccessToken(result.accessToken);
  setRefreshToken(result.refreshToken);
  return result.user;
}

/** Abmeldung: widerruft das Refresh-Token (best effort) und leert den Speicher. */
export async function logout(): Promise<void> {
  const refreshToken = getRefreshToken();
  if (refreshToken) {
    await apiFetch<void>("/auth/logout", {
      method: "POST",
      body: { refreshToken },
      auth: false,
    }).catch(() => undefined);
  }
  clearTokens();
}

/**
 * Stellt beim App-Start eine Sitzung aus dem Refresh-Token wieder her.
 * Liefert null, wenn kein gültiges Token vorhanden ist.
 */
export async function restoreSession(): Promise<AuthUser | null> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return null;
  try {
    const result = await apiFetch<AuthResult>("/auth/refresh", {
      method: "POST",
      body: { refreshToken },
      auth: false,
    });
    setAccessToken(result.accessToken);
    setRefreshToken(result.refreshToken);
    return result.user;
  } catch {
    clearTokens();
    return null;
  }
}
