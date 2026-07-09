import { apiFetch } from "./client";
import type { Paginated } from "./pagination";

export type VehicleAlert = "Warnung" | "Kritisch" | "Ablauf";
export type VehicleStatus = "OK" | VehicleAlert;

export interface Vehicle {
  id: string;
  label: string;
  leasingKmLimit: number;
  leasingKmUsed: number;
  // @db.Date -> vom Backend als ISO-String serialisiert.
  leasingEndDate: string | null;
  isActive: boolean;
  createdAt: string;
  // Serverseitig berechnete Leasing-Kennzahlen.
  usagePercent: number;
  alerts: VehicleAlert[];
  status: VehicleStatus;
}

export interface CreateVehicleInput {
  label: string;
  leasingKmLimit: number;
  leasingKmUsed?: number;
  // ISO- oder yyyy-mm-dd-String; null hebt das Datum auf.
  leasingEndDate?: string | null;
}

export interface UpdateVehicleInput {
  label: string;
  leasingKmLimit: number;
  leasingEndDate?: string | null;
}

export interface ListVehiclesParams {
  page?: number;
  pageSize?: number;
  search?: string;
  includeInactive?: boolean;
}

export interface AssignRouteResult {
  vehicle: Vehicle;
  sufficientCapacity: boolean;
}

export async function listVehicles(params: ListVehiclesParams = {}): Promise<Paginated<Vehicle>> {
  const query = new URLSearchParams();
  if (params.page) query.set("page", String(params.page));
  if (params.pageSize) query.set("pageSize", String(params.pageSize));
  if (params.search) query.set("search", params.search);
  if (params.includeInactive) query.set("includeInactive", "true");
  const qs = query.toString();
  return apiFetch<Paginated<Vehicle>>(`/vehicles${qs ? `?${qs}` : ""}`);
}

export async function getVehicle(id: string): Promise<Vehicle> {
  return apiFetch<Vehicle>(`/vehicles/${id}`);
}

export async function createVehicle(input: CreateVehicleInput): Promise<Vehicle> {
  return apiFetch<Vehicle>("/vehicles", { method: "POST", body: input });
}

export async function updateVehicle(id: string, input: UpdateVehicleInput): Promise<Vehicle> {
  return apiFetch<Vehicle>(`/vehicles/${id}`, { method: "PUT", body: input });
}

/** Kilometerstand nach einer Tour erhöhen (Regel 6). */
export async function addVehicleKm(id: string, km: number): Promise<Vehicle> {
  return apiFetch<Vehicle>(`/vehicles/${id}/km`, { method: "PUT", body: { km } });
}

/** Soft-Delete: deaktiviert das Fahrzeug. */
export async function deactivateVehicle(id: string): Promise<void> {
  await apiFetch<void>(`/vehicles/${id}`, { method: "DELETE" });
}

/** Regel 6 (VRPTW): am wenigsten genutztes Fahrzeug für eine Fahrt der Länge km. */
export async function assignRoute(km: number): Promise<AssignRouteResult> {
  return apiFetch<AssignRouteResult>(`/vehicles/assign-route?km=${encodeURIComponent(String(km))}`);
}
