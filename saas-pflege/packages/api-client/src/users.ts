import { apiFetch } from "./client";
import type { UserRole } from "./auth";

export type Locale = "DE" | "EN" | "FR";

export interface CreateFachkraftAccountInput {
  /** Bestehende Fachkraft, mit der das Konto verknüpft wird. */
  caregiverId: string;
  email: string;
  language?: Locale;
}

export interface AccountUser {
  id: string;
  email: string;
  role: UserRole;
  organizationId: string;
  language: Locale;
}

export interface FachkraftAccount {
  user: AccountUser;
  caregiverId: string;
  /**
   * Einmalig übermitteltes Klartext-Passwort: nur direkt nach dem Anlegen
   * verfügbar und nirgends abrufbar. Muss der Fachkraft weitergegeben werden.
   */
  temporaryPassword: string;
}

/**
 * Legt ein Login-Konto (Rolle FACHKRAFT) für eine bestehende Fachkraft an.
 * Das temporäre Passwort erzeugt das Backend.
 */
export async function createFachkraftAccount(
  input: CreateFachkraftAccountInput,
): Promise<FachkraftAccount> {
  return apiFetch<FachkraftAccount>("/users/fachkraft", { method: "POST", body: input });
}

export interface PasswordReset {
  user: AccountUser;
  /** Wie beim Anlegen: nur in dieser Antwort verfügbar. */
  temporaryPassword: string;
  /** Beendete Sitzungen – der Reset widerruft alle aktiven Anmeldungen. */
  revokedSessions: number;
  /**
   * false = die Sperrliste war nicht erreichbar. Passwort und Refresh-Token sind
   * zurückgesetzt, ein bereits ausgestelltes Access-Token bleibt aber bis zu
   * seinem Ablauf gültig (max. eine Access-Token-Laufzeit).
   */
  accessRevokedImmediately: boolean;
}

/**
 * Erzeugt ein neues temporäres Passwort für ein bestehendes Fachkraft-Konto.
 * Das bisherige Passwort und alle laufenden Sitzungen werden ungültig.
 */
export async function resetFachkraftPassword(userId: string): Promise<PasswordReset> {
  return apiFetch<PasswordReset>(`/users/${userId}/reset-password`, { method: "POST" });
}
