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

/**
 * Ergebnis des Anlegens: ein Einladungslink, kein Passwort.
 *
 * Bis hierhin gab die API ein temporäres Passwort im Klartext zurück. Damit
 * kannte der Admin das Geheimnis der Fachkraft und konnte sich vor ihr in
 * ihrem Namen anmelden – was danach unter ihrem Namen im Audit-Log steht,
 * wäre ihr nicht mehr sicher zuzurechnen. Über den Link wählt sie ihr
 * Passwort selbst.
 */
export interface FachkraftAccount {
  user: AccountUser;
  caregiverId: string;
  /** Nur in dieser Antwort verfügbar, danach nirgends mehr abrufbar. */
  invitationUrl: string;
  /** ISO-Zeitstempel: danach muss ein neuer Link ausgestellt werden. */
  invitationExpiresAt: string;
}

/**
 * Legt ein Login-Konto (Rolle FACHKRAFT) für eine bestehende Fachkraft an.
 * Es entsteht kein Passwort – die Antwort enthält den Einladungslink.
 */
export async function createFachkraftAccount(
  input: CreateFachkraftAccountInput,
): Promise<FachkraftAccount> {
  return apiFetch<FachkraftAccount>("/users/fachkraft", { method: "POST", body: input });
}

export interface ReissuedInvitation {
  user: AccountUser;
  invitationUrl: string;
  invitationExpiresAt: string;
  /** Beendete Sitzungen – ein neuer Link widerruft alle aktiven Anmeldungen. */
  revokedSessions: number;
  /**
   * false = die Sperrliste war nicht erreichbar. Die Refresh-Token sind
   * widerrufen, ein bereits ausgestelltes Access-Token bleibt aber bis zu
   * seinem Ablauf gültig (max. eine Access-Token-Laufzeit).
   */
  accessRevokedImmediately: boolean;
}

/**
 * Stellt einen neuen Einladungslink für ein bestehendes Fachkraft-Konto aus
 * (der erste kam nie an, ist abgelaufen, oder das Gerät ging verloren).
 *
 * Alle laufenden Sitzungen enden sofort. Das bisherige Passwort bleibt bis zum
 * Einlösen des Links gültig.
 */
export async function reissueInvitation(userId: string): Promise<ReissuedInvitation> {
  return apiFetch<ReissuedInvitation>(`/users/${userId}/invitation`, { method: "POST" });
}

export interface InvitationPreview {
  /** Für welches Konto der Link gilt. */
  email: string;
  organizationName: string;
  expiresAt: string;
}

/**
 * Was der Einladungsbildschirm vor der Eingabe anzeigt. Öffentlich: wer einen
 * Einladungslink öffnet, ist noch nicht angemeldet.
 *
 * Wirft ApiError 404 (`InvitationNotFound`), wenn der Link abgelaufen, bereits
 * benutzt oder erfunden ist – absichtlich ohne Unterscheidung.
 */
export async function previewInvitation(token: string): Promise<InvitationPreview> {
  return apiFetch<InvitationPreview>(`/auth/invitation/${encodeURIComponent(token)}`, {
    auth: false,
  });
}

export interface AcceptedInvitation {
  email: string;
}

/**
 * Setzt das Passwort und verbraucht den Link.
 *
 * Meldet NICHT an: Fachkräfte arbeiten in der App, nicht im Web. Nach dem
 * Setzen steht die Fachkraft vor der Anmeldung – mit einem Passwort, das nur
 * sie kennt.
 */
export async function acceptInvitation(
  token: string,
  password: string,
): Promise<AcceptedInvitation> {
  return apiFetch<AcceptedInvitation>(`/auth/invitation/${encodeURIComponent(token)}`, {
    method: "POST",
    body: { password },
    auth: false,
  });
}
