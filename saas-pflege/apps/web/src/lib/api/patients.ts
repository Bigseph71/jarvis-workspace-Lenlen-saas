import { apiFetch } from "./client";

export type GeocodingStatus = "PENDING" | "VALID" | "INVALID";

export interface Patient {
  id: string;
  firstName: string;
  lastName: string;
  rawAddress: string;
  normalizedAddress: string | null;
  geocodingStatus: GeocodingStatus;
  isActive: boolean;
  createdAt: string;
}

/** Generische paginierte Antwort (siehe lib/pagination.ts im Backend). */
export interface Paginated<T> {
  data: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface ListPatientsParams {
  page?: number;
  pageSize?: number;
  search?: string;
  geocodingStatus?: GeocodingStatus;
  includeInactive?: boolean;
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
