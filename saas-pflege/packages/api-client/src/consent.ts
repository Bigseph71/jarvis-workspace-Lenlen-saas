import { apiFetch } from "./client";

/** Fehlercode des Backends, wenn Tracking ohne wirksame Einwilligung versucht wird. */
export const GPS_CONSENT_MISSING = "GpsConsentMissing";

export type ConsentLocale = "DE" | "EN" | "FR";

export interface GpsConsentStatus {
  /** true = Standorterfassung zulässig. */
  granted: boolean;
  /**
   * Version, der zuletzt zugestimmt wurde (null = noch nie).
   * `granted=false` bei gesetzter `acceptedVersion` heißt: der Text hat sich
   * geändert und ist erneut zu bestätigen.
   */
  acceptedVersion: string | null;
  /** Aktuell gültige Textversion – die App zeigt genau diesen Text an. */
  currentVersion: string;
  grantedAt: string | null;
  revokedAt: string | null;
}

/** Einwilligungsstand der eingeloggten Fachkraft. */
export async function getGpsConsent(): Promise<GpsConsentStatus> {
  return apiFetch<GpsConsentStatus>("/consent/gps");
}

/**
 * Erteilt die Einwilligung zur Standorterfassung. Die Version muss die sein,
 * die der Nutzer tatsächlich angezeigt bekam – das Backend lehnt eine veraltete
 * ab, damit keine Zustimmung zu einem nie gezeigten Text entsteht.
 */
export async function grantGpsConsent(
  policyVersion: string,
  locale: ConsentLocale = "DE",
): Promise<GpsConsentStatus> {
  return apiFetch<GpsConsentStatus>("/consent/gps", {
    method: "POST",
    body: { policyVersion, locale },
  });
}

/** Widerruft die Einwilligung (wirkt ab sofort, nur für die Zukunft). */
export async function revokeGpsConsent(): Promise<GpsConsentStatus> {
  return apiFetch<GpsConsentStatus>("/consent/gps", { method: "DELETE" });
}
