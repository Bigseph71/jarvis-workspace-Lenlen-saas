import {
  apiFetch,
  type AuthResult,
  type ChangePasswordInput,
  type LoginCredentials,
  type RegisterOrganizationInput,
  type SessionResult,
  type SessionTransport,
} from "@len-len/api-client";

/**
 * Sitzungsverwaltung des Webs: das Refresh-Token lebt im httpOnly-Cookie,
 * gesetzt von den Route Handlern unter /api/auth (siehe
 * lib/server/session-cookie.ts für das Warum).
 *
 * Arbeitsteilung, und zwar mit Absicht ungleich:
 *
 *  - anmelden, registrieren, Passwort wechseln gehen DIREKT ans Backend. Diese
 *    Endpoints sind je IP begrenzt; über den eigenen Server gespiegelt kämen
 *    sie alle von derselben Adresse und der Brute-Force-Schutz wäre keiner
 *    mehr. Das zurückgegebene Refresh-Token wandert sofort ins Cookie und wird
 *    hier nirgends abgelegt.
 *  - erneuern und abmelden gehen über die eigenen Route Handler, weil nur der
 *    Server das Cookie lesen kann.
 */

const SESSION_URL = "/api/auth/session";

/** Legt das Refresh-Token einer frischen Anmeldung im Cookie ab. */
async function storeRefreshToken(refreshToken: string): Promise<void> {
  const res = await fetch(SESSION_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken }),
  });
  if (!res.ok) {
    // Ohne Cookie gäbe es eine Sitzung, die den nächsten Seitenwechsel nicht
    // überlebt – der Benutzer stünde ohne erkennbaren Grund wieder am Login.
    // Lieber hier deutlich scheitern.
    throw new Error("Sitzung konnte nicht gespeichert werden");
  }
}

/** Anmeldung, Registrierung und Passwortwechsel enden alle gleich. */
async function intoSession(result: AuthResult): Promise<SessionResult> {
  await storeRefreshToken(result.refreshToken);
  return { accessToken: result.accessToken, user: result.user };
}

interface RefreshResponse {
  session: SessionResult | null;
}

export const webSessionTransport: SessionTransport = {
  async login(credentials: LoginCredentials): Promise<SessionResult> {
    const result = await apiFetch<AuthResult>("/auth/login", {
      method: "POST",
      body: credentials,
      auth: false,
    });
    return intoSession(result);
  },

  async register(input: RegisterOrganizationInput): Promise<SessionResult> {
    const result = await apiFetch<AuthResult>("/auth/register-organization", {
      method: "POST",
      body: input,
      auth: false,
    });
    return intoSession(result);
  },

  async changePassword(input: ChangePasswordInput): Promise<SessionResult> {
    // auth: true – apiFetch hängt den Access-Token aus dem Speicher an.
    const result = await apiFetch<AuthResult>("/auth/change-password", {
      method: "POST",
      body: input,
    });
    return intoSession(result);
  },

  async refresh(): Promise<SessionResult | null> {
    const res = await fetch(`${SESSION_URL}/refresh`, { method: "POST" });
    if (!res.ok) {
      // 502: das Backend ist gestört. Als "keine Sitzung" zu antworten hiesse,
      // den Benutzer wegen einer vorübergehenden Störung abzumelden.
      throw new Error("Sitzung konnte nicht erneuert werden");
    }
    const data = (await res.json()) as RefreshResponse;
    return data.session;
  },

  async logout(): Promise<void> {
    await fetch(SESSION_URL, { method: "DELETE" });
  },
};
