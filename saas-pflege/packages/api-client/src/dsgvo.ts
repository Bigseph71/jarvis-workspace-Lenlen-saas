import { apiFetch } from "./client";
import { getApiConfig } from "./config";

/**
 * Betroffenenrechte: Auskunft (Art. 15/20) und Löschung (Art. 17).
 *
 * Verantwortlicher im Sinne der DSGVO ist der Pflegedienst, nicht diese
 * Plattform. Sie beantwortet Betroffenenanfragen also nicht selbst, sie gibt
 * dem Tenant das Werkzeug, seiner eigenen Pflicht nachzukommen.
 */

export type SubjectKind = "patient" | "caregiver";

/** Bericht der Anonymisierung einer Fachkraft. */
export interface CaregiverErasureReport {
  caregiverId: string;
  anonymizedAt: string;
  deleted: {
    gpsPositions: number;
    gpsConsents: number;
    refreshTokens: number;
    absenceReasons: number;
  };
  userAnonymized: boolean;
  /** Erhalten gebliebene Datenarten, jeweils mit Rechtsgrund. */
  retained: string[];
}

/**
 * Bericht des Löschverlangens eines Patienten.
 *
 * `outcome` unterscheidet die beiden Stufen: solange die Aufbewahrungsfrist
 * der Pflegedokumentation läuft (§ 630f BGB), wird gesperrt und NICHTS
 * gelöscht; danach anonymisiert.
 */
export interface PatientErasureReport {
  patientId: string;
  outcome: "restricted" | "anonymized";
  lastVisitAt: string | null;
  /** Ab diesem Zeitpunkt ist die Anonymisierung zulässig. */
  anonymizableFrom: string;
  retentionYears: number;
  retained: string[];
}

/**
 * Lädt die Auskunft als Datei herunter.
 *
 * Bewusst über fetch + Blob statt eines schlichten Links: der Endpunkt
 * verlangt einen Bearer-Token, den ein `<a href>` nicht mitschickt. Der Token
 * kommt aus derselben Ablage wie bei jedem anderen Aufruf.
 */
export async function downloadExport(kind: SubjectKind, id: string): Promise<void> {
  const { baseUrl, storage } = getApiConfig();
  const path = kind === "patient" ? `/export/patients/${id}` : `/export/caregivers/${id}`;

  const res = await fetch(`${baseUrl}${path}`, {
    headers: { Authorization: `Bearer ${await storage.getAccessToken()}` },
  });
  if (!res.ok) throw new Error(`Export fehlgeschlagen (${res.status})`);

  const blob = await res.blob();
  // Dateiname aus dem Content-Disposition des Servers, damit Web und API
  // dieselbe Benennung verwenden.
  const match = /filename="([^"]+)"/.exec(res.headers.get("content-disposition") ?? "");
  const filename = match?.[1] ?? `auskunft-${kind}-${id}.json`;

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Anonymisiert eine Fachkraft. Nicht umkehrbar. */
export async function eraseCaregiver(id: string): Promise<CaregiverErasureReport> {
  return apiFetch<CaregiverErasureReport>(`/erasure/caregivers/${id}`, { method: "DELETE" });
}

/**
 * Löschverlangen eines Patienten. Sperrt oder anonymisiert, je nach
 * Aufbewahrungsfrist; der Bericht sagt, was geschah.
 */
export async function erasePatient(id: string): Promise<PatientErasureReport> {
  return apiFetch<PatientErasureReport>(`/erasure/patients/${id}`, { method: "DELETE" });
}
