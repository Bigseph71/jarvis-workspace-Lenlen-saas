import { apiFetch } from "./client";
import type { Paginated } from "./pagination";

export type Qualification =
  | "PFLEGEFACHKRAFT"
  | "PFLEGEHILFSKRAFT"
  | "BETREUUNGSKRAFT"
  | "AUSZUBILDENDE";

export interface Caregiver {
  id: string;
  firstName: string;
  lastName: string;
  qualification: Qualification;
  isActive: boolean;
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
