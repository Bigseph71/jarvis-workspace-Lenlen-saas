import { apiFetch } from "./client";
import type { Paginated } from "./pagination";
import type { GeocodingStatus } from "./patients";

export type VisitStatus = "PLANNED" | "IN_PROGRESS" | "COMPLETED" | "MISSED" | "CANCELED";

interface PersonRef {
  id: string;
  firstName: string;
  lastName: string;
}

export interface Visit {
  id: string;
  patientId: string;
  scheduledAt: string;
  status: VisitStatus;
  isEmergency: boolean;
  emergencyReason: string | null;
  patient: PersonRef;
  caregiver: (PersonRef & { userId: string | null }) | null;
  assignedCaregiver: PersonRef | null;
}

export interface ListVisitsParams {
  page?: number;
  pageSize?: number;
  from?: string;
  to?: string;
  patientId?: string;
  caregiverId?: string;
  status?: VisitStatus;
  includeEmergency?: boolean;
}

export interface CreateVisitInput {
  patientId: string;
  scheduledAt: string;
  assignedCaregiverId?: string;
  caregiverId?: string;
}

export interface MissingWeekResult {
  week: { start: string; end: string };
  count: number;
  patients: { id: string; firstName: string; lastName: string; assignedCaregiverId: string | null }[];
}

export async function listVisits(params: ListVisitsParams = {}): Promise<Paginated<Visit>> {
  const query = new URLSearchParams();
  if (params.page) query.set("page", String(params.page));
  if (params.pageSize) query.set("pageSize", String(params.pageSize));
  if (params.from) query.set("from", params.from);
  if (params.to) query.set("to", params.to);
  if (params.patientId) query.set("patientId", params.patientId);
  if (params.caregiverId) query.set("caregiverId", params.caregiverId);
  if (params.status) query.set("status", params.status);
  if (params.includeEmergency === false) query.set("includeEmergency", "false");

  const qs = query.toString();
  return apiFetch<Paginated<Visit>>(`/visits${qs ? `?${qs}` : ""}`);
}

export async function createVisit(input: CreateVisitInput): Promise<Visit> {
  return apiFetch<Visit>("/visits", { method: "POST", body: input });
}

export async function cancelVisit(id: string): Promise<Visit> {
  return apiFetch<Visit>(`/visits/${id}/cancel`, { method: "POST" });
}

export async function missingWeek(weekOf?: string): Promise<MissingWeekResult> {
  const qs = weekOf ? `?weekOf=${encodeURIComponent(weekOf)}` : "";
  return apiFetch<MissingWeekResult>(`/visits/alerts/missing-week${qs}`);
}

// ── Tagesroute der Fachkraft (Mobile) ────────────────────────────────────

/** Patient inkl. Adresse und Koordinaten (Navigation). Decimal -> String. */
export interface MyDayPatient {
  id: string;
  firstName: string;
  lastName: string;
  rawAddress: string;
  normalizedAddress: string | null;
  latitude: string | null;
  longitude: string | null;
  geocodingStatus: GeocodingStatus;
}

export interface MyVisit {
  id: string;
  patientId: string;
  scheduledAt: string;
  status: VisitStatus;
  isEmergency: boolean;
  emergencyReason: string | null;
  gpsArrivalAt: string | null;
  gpsDepartureAt: string | null;
  patient: MyDayPatient;
}

export interface MyDayResult {
  date: string;
  count: number;
  visits: MyVisit[];
}

/** Tagesroute der eingeloggten Fachkraft (GET /visits/mine). */
export async function myVisits(date?: string): Promise<MyDayResult> {
  const qs = date ? `?date=${encodeURIComponent(date)}` : "";
  return apiFetch<MyDayResult>(`/visits/mine${qs}`);
}

/** Position beim Pointage; recordedAt (ISO) für Offline-Nachreichung. */
export interface PointagePayload {
  latitude?: number;
  longitude?: number;
  accuracy?: number;
  recordedAt?: string;
}

/** Pointage Ankunft (PLANNED -> IN_PROGRESS). */
export async function checkInVisit(id: string, pointage?: PointagePayload): Promise<Visit> {
  return apiFetch<Visit>(`/visits/${id}/check-in`, { method: "POST", body: pointage });
}

/** Pointage Abfahrt (IN_PROGRESS -> COMPLETED). */
export async function checkOutVisit(id: string, pointage?: PointagePayload): Promise<Visit> {
  return apiFetch<Visit>(`/visits/${id}/check-out`, { method: "POST", body: pointage });
}
