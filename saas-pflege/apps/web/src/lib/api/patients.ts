import { apiFetch } from "./client";
import type { Paginated } from "./pagination";

export type GeocodingStatus = "PENDING" | "VALID" | "INVALID";

export interface Patient {
  id: string;
  firstName: string;
  lastName: string;
  rawAddress: string;
  normalizedAddress: string | null;
  assignedCaregiverId: string | null;
  geocodingStatus: GeocodingStatus;
  isActive: boolean;
  createdAt: string;
}

/** Detailansicht inkl. zugewiesener Fachkraft (GET /patients/:id). */
export interface PatientDetail extends Patient {
  assignedCaregiver: { id: string; firstName: string; lastName: string } | null;
}

export interface ListPatientsParams {
  page?: number;
  pageSize?: number;
  search?: string;
  geocodingStatus?: GeocodingStatus;
  includeInactive?: boolean;
}

/** Eingabe Anlegen: assignedCaregiverId optional (keine Zuweisung = weglassen). */
export interface CreatePatientInput {
  firstName: string;
  lastName: string;
  rawAddress: string;
  assignedCaregiverId?: string;
}

/** Eingabe Bearbeiten: alle Felder optional; null hebt die Zuweisung auf. */
export interface UpdatePatientInput {
  firstName?: string;
  lastName?: string;
  rawAddress?: string;
  assignedCaregiverId?: string | null;
}

export async function listPatients(params: ListPatientsParams = {}): Promise<Paginated<Patient>> {
  const query = new URLSearchParams();
  if (params.page) query.set("page", String(params.page));
  if (params.pageSize) query.set("pageSize", String(params.pageSize));
  if (params.search) query.set("search", params.search);
  if (params.geocodingStatus) query.set("geocodingStatus", params.geocodingStatus);
  if (params.includeInactive) query.set("includeInactive", "true");

  const qs = query.toString();
  return apiFetch<Paginated<Patient>>(`/patients${qs ? `?${qs}` : ""}`);
}

export async function getPatient(id: string): Promise<PatientDetail> {
  return apiFetch<PatientDetail>(`/patients/${id}`);
}

export async function createPatient(input: CreatePatientInput): Promise<Patient> {
  return apiFetch<Patient>("/patients", { method: "POST", body: input });
}

export async function updatePatient(id: string, input: UpdatePatientInput): Promise<Patient> {
  return apiFetch<Patient>(`/patients/${id}`, { method: "PATCH", body: input });
}

/** Soft-Delete: deaktiviert den Patienten (isActive=false), erhält die Historie. */
export async function deactivatePatient(id: string): Promise<void> {
  await apiFetch<void>(`/patients/${id}`, { method: "DELETE" });
}
