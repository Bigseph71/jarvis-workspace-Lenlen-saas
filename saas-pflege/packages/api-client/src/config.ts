import type {
  ChangePasswordInput,
  LoginCredentials,
  RegisterOrganizationInput,
  SessionResult,
} from "./auth-types";

/**
 * Plattformneutrale Konfiguration des API-Clients.
 *
 * Web (Next.js) und Mobile (React Native / Expo) injizieren beim App-Start
 * ihre eigene Token-Ablage und Base-URL:
 *  - Web: Access-Token im Speicher, Refresh-Token im httpOnly-Cookie (siehe
 *    SessionTransport) – für den Client-Code unsichtbar
 *  - Mobile: expo-secure-store (asynchron)
 */
export interface TokenStorage {
  /** Methoden dürfen synchron (Web) oder asynchron (SecureStore) sein. */
  getAccessToken(): string | null | Promise<string | null>;
  setAccessToken(token: string | null): void | Promise<void>;
  getRefreshToken(): string | null | Promise<string | null>;
  setRefreshToken(token: string | null): void | Promise<void>;
}

/**
 * Sitzungsverwaltung ohne Refresh-Token im Browser.
 *
 * Ist `session` gesetzt, hält der Client das Refresh-Token NICHT selbst. Jeder
 * Schritt, der es braucht – anmelden, erneuern, Passwort wechseln, abmelden –
 * geht an einen Endpoint DERSELBEN Origin, der es in einem httpOnly-Cookie
 * verwahrt (Web: Next.js Route Handler). JavaScript im Browser bekommt es nie
 * zu sehen, ein XSS kann es also auch nicht auslesen.
 *
 * Warum nur im Web: Mobile hat weder Origin noch Cookie-Jar, und das
 * Refresh-Token liegt dort in expo-secure-store, also im Schlüsselbund des
 * Geräts und ausserhalb der Reichweite von JavaScript. Der Angriffsweg, gegen
 * den das Cookie schützt, existiert dort nicht. Deshalb ist das Feld optional
 * und die Mobile-App setzt es nicht.
 *
 * Fehlerverhalten: die Methoden werfen ApiError wie ein normaler Aufruf –
 * ausser `refresh`, das bei fehlender oder abgelaufener Sitzung `null`
 * liefert. Das ist der Normalfall (jeder erste Seitenaufruf ohne Anmeldung)
 * und keine Ausnahme.
 */
export interface SessionTransport {
  login(credentials: LoginCredentials): Promise<SessionResult>;
  register(input: RegisterOrganizationInput): Promise<SessionResult>;
  /**
   * Das Backend beendet beim Passwortwechsel alle Sitzungen und stellt ein
   * neues Token-Paar aus – das Cookie muss also mitgeführt werden, sonst
   * bliebe darin ein soeben widerrufenes Token zurück.
   */
  changePassword(input: ChangePasswordInput): Promise<SessionResult>;
  /** null = keine gültige Sitzung (kein Cookie, abgelaufen oder widerrufen). */
  refresh(): Promise<SessionResult | null>;
  logout(): Promise<void>;
}

export interface ApiClientConfig {
  baseUrl: string;
  storage: TokenStorage;
  /** Gesetzt = Refresh-Token serverseitig im httpOnly-Cookie (nur Web). */
  session?: SessionTransport;
}

let config: ApiClientConfig | null = null;

/** Einmalig beim App-Start aufrufen, vor dem ersten API-Aufruf. */
export function configureApiClient(next: ApiClientConfig): void {
  config = next;
}

export function getApiConfig(): ApiClientConfig {
  if (!config) {
    throw new Error(
      "API-Client nicht konfiguriert: configureApiClient({ baseUrl, storage }) beim App-Start aufrufen",
    );
  }
  return config;
}

/**
 * Leert die lokal gehaltenen Token (Logout / Sitzungsende).
 *
 * Betrifft nur, was dieser Client selbst ablegt. Das Cookie einer
 * SessionTransport-Sitzung wird hier NICHT gelöscht – das kann nur der
 * Server, der es gesetzt hat, und es geschieht in `logout()`.
 */
export async function clearTokens(): Promise<void> {
  const { storage } = getApiConfig();
  await storage.setAccessToken(null);
  await storage.setRefreshToken(null);
}
