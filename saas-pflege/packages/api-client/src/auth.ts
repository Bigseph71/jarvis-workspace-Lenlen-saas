import { apiFetch } from "./client";
import { clearTokens, getApiConfig } from "./config";
import type {
  AuthResult,
  AuthUser,
  ChangePasswordInput,
  LoginCredentials,
  RegisterOrganizationInput,
  SessionResult,
} from "./auth-types";

// Weiterhin von hier exportiert, damit bestehende Importe gültig bleiben.
export type {
  AuthResult,
  AuthUser,
  ChangePasswordInput,
  LoginCredentials,
  RegisterOrganizationInput,
  SessionResult,
  UserRole,
} from "./auth-types";

/**
 * Übernimmt das Ergebnis einer Anmeldung in die lokale Ablage.
 *
 * Zwei Wege, ein Ergebnis: mit SessionTransport liegt das Refresh-Token im
 * Cookie und es gibt hier nichts zu speichern ausser dem Access-Token; ohne
 * ihn (Mobile) werden beide abgelegt.
 */
async function persist(result: AuthResult | SessionResult): Promise<AuthUser> {
  const { storage } = getApiConfig();
  await storage.setAccessToken(result.accessToken);
  if ("refreshToken" in result) {
    await storage.setRefreshToken(result.refreshToken);
  }
  return result.user;
}

/** Anmeldung: persistiert die Token und liefert den Benutzer. */
export async function login(credentials: LoginCredentials): Promise<AuthUser> {
  const { session } = getApiConfig();
  if (session) return persist(await session.login(credentials));

  const result = await apiFetch<AuthResult>("/auth/login", {
    method: "POST",
    body: credentials,
    auth: false,
  });
  return persist(result);
}

/**
 * Selbstregistrierung: legt Organisation und ersten Struktur-Admin an.
 *
 * Das Backend liefert bereits ein Token-Paar zurück – die neue Anmeldung wird
 * hier direkt persistiert, ein zweiter Login-Schritt entfällt. Ein Nutzer, der
 * sich gerade registriert hat, soll nicht sein eben gewähltes Passwort erneut
 * eintippen müssen.
 */
export async function registerOrganization(
  input: RegisterOrganizationInput,
): Promise<AuthUser> {
  const { session } = getApiConfig();
  if (session) return persist(await session.register(input));

  const result = await apiFetch<AuthResult>("/auth/register-organization", {
    method: "POST",
    body: input,
    auth: false,
  });
  return persist(result);
}

/**
 * Wechselt das Passwort des angemeldeten Kontos (auch der erzwungene Wechsel
 * beim ersten Login). Das Backend beendet dabei alle Sitzungen und liefert ein
 * frisches Token-Paar – das wird hier direkt persistiert, der Nutzer bleibt
 * also angemeldet.
 */
export async function changePassword(input: ChangePasswordInput): Promise<AuthUser> {
  const { session } = getApiConfig();
  if (session) return persist(await session.changePassword(input));

  const result = await apiFetch<AuthResult>("/auth/change-password", {
    method: "POST",
    body: input,
  });
  return persist(result);
}

/** Abmeldung: widerruft das Refresh-Token (best effort) und leert den Speicher. */
export async function logout(): Promise<void> {
  const { session, storage } = getApiConfig();
  if (session) {
    // Der Endpoint löscht das Cookie und widerruft das Token serverseitig.
    // Schlägt er fehl, wird trotzdem lokal abgemeldet: eine Abmeldung, die
    // an einer Netzstörung scheitert, liesse den Benutzer angemeldet zurück.
    await session.logout().catch(() => undefined);
    await clearTokens();
    return;
  }

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
 * Stellt beim App-Start eine Sitzung wieder her.
 * Liefert null, wenn keine gültige Sitzung vorhanden ist.
 */
export async function restoreSession(): Promise<AuthUser | null> {
  const { session, storage } = getApiConfig();

  if (session) {
    // Kein lokales Vorab-Wissen möglich: ob eine Sitzung besteht, weiss nur
    // der Server, der das Cookie hält. Der Aufruf ist deshalb der Normalfall
    // bei jedem Seitenaufruf – auch beim allerersten ohne Anmeldung.
    try {
      const result = await session.refresh();
      if (!result) {
        await clearTokens();
        return null;
      }
      return persist(result);
    } catch {
      await clearTokens();
      return null;
    }
  }

  const refreshToken = await storage.getRefreshToken();
  if (!refreshToken) return null;
  try {
    const result = await apiFetch<AuthResult>("/auth/refresh", {
      method: "POST",
      body: { refreshToken },
      auth: false,
    });
    return persist(result);
  } catch {
    await clearTokens();
    return null;
  }
}
