/**
 * Auth-Typen, getrennt von auth.ts.
 *
 * Grund für die eigene Datei: config.ts beschreibt seit der Umstellung auf
 * httpOnly-Cookies einen SessionTransport, dessen Methoden einen AuthUser
 * liefern. Lägen die Typen weiter in auth.ts, importierten sich auth.ts und
 * config.ts gegenseitig. Nach aussen ändert sich nichts – index.ts exportiert
 * beide Dateien, die Aufrufer importieren wie bisher aus @len-len/api-client.
 */

// Rollen wie im Backend (lokal gespiegelt, um keine Backend-Pakete in die
// Clients zu ziehen).
export type UserRole = "SUPER_ADMIN" | "STRUKTUR_ADMIN" | "KOORDINATOR" | "HR" | "FACHKRAFT";

export interface AuthUser {
  id: string;
  email: string;
  role: UserRole;
  organizationId: string;
  /**
   * true = das Konto hat ein temporäres Passwort. Bis zum Wechsel per
   * changePassword() beantwortet das Backend jeden anderen Endpoint mit 403
   * (Code "PasswordChangeRequired").
   */
  mustChangePassword: boolean;
}

/** Antwort des Backends auf login / register / refresh / change-password. */
export interface AuthResult {
  accessToken: string;
  refreshToken: string;
  user: AuthUser;
}

/**
 * Dasselbe OHNE Refresh-Token: was ein SessionTransport zurückgibt.
 *
 * Das Feld fehlt hier nicht aus Versehen, sondern ist der ganze Zweck der
 * Übung: das Refresh-Token bleibt im httpOnly-Cookie und erreicht den
 * Browser-Code nie. Wäre es Teil des Typs, würde es früher oder später jemand
 * wieder irgendwo ablegen.
 */
export interface SessionResult {
  accessToken: string;
  user: AuthUser;
}

export interface LoginCredentials {
  email: string;
  password: string;
  /** Nur nötig, wenn dieselbe E-Mail in mehreren Organisationen existiert. */
  organizationId?: string;
}

export interface RegisterOrganizationInput {
  organizationName: string;
  /** ISO-3166-1 alpha-2, Vorgabe DE. */
  country?: string;
  adminEmail: string;
  adminPassword: string;
}

export interface ChangePasswordInput {
  currentPassword: string;
  newPassword: string;
}
