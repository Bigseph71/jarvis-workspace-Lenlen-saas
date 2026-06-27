import { apiFetch } from "./client";
import type { Paginated } from "./pagination";

export type Qualification =
  | "PFLEGEFACHKRAFT"
  | "PFLEGEHILFSKRAFT"
  | "BETREUUNGSKRAFT"
  | "AUSZUBILDENDE";

export type ContractType = "FULL_100" | "PART_80" | "PART_50" | "MINIJOB" | "CUSTOM";

export type WeekDay = "MON" | "TUE" | "WED" | "THU" | "FRI" | "SAT" | "SUN";

export interface Caregiver {
  id: string;
  firstName: string;
  lastName: string;
  qualification: Qualification;
  contractType: ContractType;
  // Decimal wird vom Backend als String serialisiert.
  weeklyHours: string;
  workDays: WeekDay[];
  maxPatients: number;
  isActive: boolean;
  createdAt: string;
}

export interface CaregiverDetail extends Caregiver {
  _count?: { assignedPatients: number };
}

/** Vertrags-Block (Regel métier 5: bei jeder Fachkraft Pflicht). */
export interface ContractInput {
  contractType: ContractType;
  weeklyHours: number;
  workDays: WeekDay[];
  maxPatients: number;
}

export interface CreateCaregiverInput extends ContractInput {
  firstName: string;
  lastName: string;
  qualification: Qualification;
  userId?: string;
}

export interface ListCaregiversParams {
  page?: number;
  pageSize?: number;
  search?: string;
  includeInactive?: boolean;
}

export async function listCaregivers(
  params: ListCaregiversParams = {},
): Promise<Paginated<Caregiver>> {
  const query = new URLSearchParams();
  if (params.page) query.set("page", String(params.page));
  if (params.pageSize) query.set("pageSize", String(params.pageSize));
  if (params.search) query.set("search", params.search);
  if (params.includeInactive) query.set("includeInactive", "true");

  const qs = query.toString();
  return apiFetch<Paginated<Caregiver>>(`/caregivers${qs ? `?${qs}` : ""}`);
}

export async function getCaregiver(id: string): Promise<CaregiverDetail> {
  return apiFetch<CaregiverDetail>(`/caregivers/${id}`);
}

export async function createCaregiver(input: CreateCaregiverInput): Promise<Caregiver> {
  return apiFetch<Caregiver>("/caregivers", { method: "POST", body: input });
}

/** Aktualisiert nur den Vertrags-Block (PUT /caregivers/:id/contract). */
export async function updateContract(id: string, input: ContractInput): Promise<Caregiver> {
  return apiFetch<Caregiver>(`/caregivers/${id}/contract`, { method: "PUT", body: input });
}
