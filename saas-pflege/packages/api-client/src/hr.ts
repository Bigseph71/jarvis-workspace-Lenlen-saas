import { apiFetch } from "./client";
import type { Paginated } from "./pagination";
import type { ContractType, WeekDay } from "./caregivers";

/**
 * HR-Modul: Verträge und Abwesenheiten (`/hr/...`).
 *
 * Die Einzel-Endpoints liefern den Datensatz und antworten bei einer
 * abgelehnten Zeile mit 422 samt Begründung (ApiError.message). Die
 * `/batch`-Endpoints liefern stattdessen einen Bericht mit `applied` und
 * `rejected` – sie bedienen Import und Konnektoren, nicht die Oberfläche.
 */

export type ExternalSource = "MANUAL" | "CSV" | "PERSONIO";

export type AbsenceType = "VACATION" | "SICK" | "TRAINING" | "PARENTAL" | "UNPAID" | "OTHER";
export type AbsenceStatus = "REQUESTED" | "APPROVED" | "REJECTED" | "CANCELED";

export const ABSENCE_TYPES: AbsenceType[] = [
  "VACATION",
  "SICK",
  "TRAINING",
  "PARENTAL",
  "UNPAID",
  "OTHER",
];

// ── Verträge ──────────────────────────────────────────────────────────────

export interface Contract {
  id: string;
  organizationId: string;
  caregiverId: string;
  contractType: ContractType;
  /** Decimal – vom Backend als String serialisiert. */
  weeklyHours: string;
  workDays: WeekDay[];
  maxPatients: number;
  /** @db.Date -> ISO-String. */
  validFrom: string;
  /** null = laufender Vertrag. */
  validUntil: string | null;
  externalId: string | null;
  externalSource: ExternalSource;
  createdAt: string;
  updatedAt: string;
}

export interface ListContractsParams {
  page?: number;
  pageSize?: number;
  caregiverId?: string;
  /** Nur der zu diesem Datum geltende Vertrag (YYYY-MM-DD). */
  activeOn?: string;
  /** Inkrementelle Synchronisation (ISO-Zeitpunkt). */
  updatedSince?: string;
}

export interface CreateContractInput {
  caregiverId: string;
  contractType: ContractType;
  weeklyHours: number;
  workDays: WeekDay[];
  maxPatients: number;
  /** YYYY-MM-DD */
  validFrom: string;
  validUntil?: string | null;
  externalId?: string;
  externalSource?: ExternalSource;
}

function toQuery(params: Record<string, string | number | undefined>): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") query.set(key, String(value));
  }
  const qs = query.toString();
  return qs ? `?${qs}` : "";
}

/** Vertragshistorie, jüngste Version zuerst. */
export async function listContracts(params: ListContractsParams = {}): Promise<Paginated<Contract>> {
  return apiFetch<Paginated<Contract>>(`/hr/contracts${toQuery({ ...params })}`);
}

/**
 * Legt eine Vertragsversion mit ausdrücklichem Zeitraum an.
 *
 * Achtung, das ist NICHT der Weg für "Vertrag ändern": dieser Endpoint prüft
 * auf Überschneidung und lehnt ab, statt den laufenden Vertrag stillschweigend
 * zu beenden. Für eine Änderung ist `updateContract` (Vertragsmodul der
 * Fachkraft) zuständig, das den Zeitstrahl fortschreibt.
 */
export async function createContract(input: CreateContractInput): Promise<Contract> {
  return apiFetch<Contract>("/hr/contracts", { method: "POST", body: input });
}

/** Beendet einen laufenden Vertrag zum angegebenen Datum (YYYY-MM-DD). */
export async function endContract(id: string, validUntil: string): Promise<Contract> {
  return apiFetch<Contract>(`/hr/contracts/${id}/end`, { method: "POST", body: { validUntil } });
}

// ── Abwesenheiten ─────────────────────────────────────────────────────────

export interface Absence {
  id: string;
  organizationId: string;
  caregiverId: string;
  type: AbsenceType;
  status: AbsenceStatus;
  startDate: string;
  endDate: string;
  reason: string | null;
  decidedByUserId: string | null;
  decidedAt: string | null;
  externalId: string | null;
  externalSource: ExternalSource;
  createdAt: string;
  updatedAt: string;
  /** Mitgeliefert von GET /hr/absences, damit die Liste Namen zeigen kann. */
  caregiver?: { id: string; firstName: string; lastName: string };
}

export interface ListAbsencesParams {
  page?: number;
  pageSize?: number;
  caregiverId?: string;
  status?: AbsenceStatus;
  /** Überschneidung mit dem Fenster [from, to] (YYYY-MM-DD). */
  from?: string;
  to?: string;
  updatedSince?: string;
}

export interface CreateAbsenceInput {
  caregiverId: string;
  type: AbsenceType;
  startDate: string;
  endDate: string;
  reason?: string;
  externalId?: string;
  externalSource?: ExternalSource;
}

export async function listAbsences(params: ListAbsencesParams = {}): Promise<Paginated<Absence>> {
  return apiFetch<Paginated<Absence>>(`/hr/absences${toQuery({ ...params })}`);
}

export async function createAbsence(input: CreateAbsenceInput): Promise<Absence> {
  return apiFetch<Absence>("/hr/absences", { method: "POST", body: input });
}

export async function approveAbsence(id: string, reason?: string): Promise<Absence> {
  return apiFetch<Absence>(`/hr/absences/${id}/approve`, { method: "POST", body: { reason } });
}

export async function rejectAbsence(id: string, reason?: string): Promise<Absence> {
  return apiFetch<Absence>(`/hr/absences/${id}/reject`, { method: "POST", body: { reason } });
}

export async function cancelAbsence(id: string, reason?: string): Promise<Absence> {
  return apiFetch<Absence>(`/hr/absences/${id}/cancel`, { method: "POST", body: { reason } });
}
