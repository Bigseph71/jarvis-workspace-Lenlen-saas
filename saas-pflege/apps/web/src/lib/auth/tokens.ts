/**
 * Token-Speicher für den Browser.
 *
 * MVP-Entscheidung: Access-Token im Speicher (verschwindet beim Reload),
 * Refresh-Token in localStorage, damit die Sitzung einen Reload überlebt.
 *
 * TODO (Produktion / Härtung): Refresh-Token in ein httpOnly-Cookie verlagern
 * (via Next.js Route Handler), um XSS-Diebstahl zu verhindern. Siehe
 * Sicherheits-Checkliste im CLAUDE.md (JWT 15 min + Refresh-Rotation).
 */
const REFRESH_KEY = "lenlen.refreshToken";

let accessToken: string | null = null;

export function getAccessToken(): string | null {
  return accessToken;
}

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

export function getRefreshToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(REFRESH_KEY);
}

export function setRefreshToken(token: string | null): void {
  if (typeof window === "undefined") return;
  if (token) {
    window.localStorage.setItem(REFRESH_KEY, token);
  } else {
    window.localStorage.removeItem(REFRESH_KEY);
  }
}

export function clearTokens(): void {
  accessToken = null;
  setRefreshToken(null);
}
