/**
 * Token-Speicher für den Browser.
 *
 * Der Access-Token lebt im Speicher und verschwindet beim Neuladen – er gilt
 * 15 Minuten, und die Sitzung wird beim Start ohnehin aus dem Cookie
 * wiederhergestellt.
 *
 * Das Refresh-Token steht hier bewusst NICHT mehr. Es lag früher in
 * localStorage, wo jedes Skript auf der Seite es lesen konnte; heute hält es
 * ein httpOnly-Cookie, das nur der Web-Server sieht (siehe
 * lib/server/session-cookie.ts und lib/auth/session-transport.ts).
 *
 * Die beiden Refresh-Methoden bleiben erhalten, weil der gemeinsame
 * API-Client sie verlangt – dieselbe Schnittstelle bedient auch die
 * Mobile-App, die ihr Token in expo-secure-store hält. Im Web tun sie nichts:
 * `get` liefert immer null, `set` verwirft. Das ist kein Übersehen, sondern
 * die Aussage "hier wird nichts gespeichert".
 */
let accessToken: string | null = null;

export function getAccessToken(): string | null {
  return accessToken;
}

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

/** Immer null: im Web kennt JavaScript das Refresh-Token nicht. */
export function getRefreshToken(): null {
  return null;
}

/** Ohne Wirkung: das Cookie setzt und löscht ausschliesslich der Server. */
export function setRefreshToken(_token: string | null): void {
  // absichtlich leer
}

export function clearTokens(): void {
  accessToken = null;
}
