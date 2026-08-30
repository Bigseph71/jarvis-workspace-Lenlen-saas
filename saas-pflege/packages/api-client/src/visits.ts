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

/**
 * Notfallbesuch (Regel métier 2): ausserhalb des Wochenzyklus, Motiv
 * verpflichtend. Kein `assignedCaregiverId` – die Stamm-Fachkraft bleibt die
 * des Patienten, `caregiverId` benennt nur, wer tatsächlich fährt.
 */
export interface CreateEmergencyVisitInput {
  patientId: string;
  scheduledAt: string;
  caregiverId?: string;
  emergencyReason: string;
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

/** Notfallbesuch anlegen (eigener Endpunkt, eigene Regeln). */
export async function createEmergencyVisit(input: CreateEmergencyVisitInput): Promise<Visit> {
  return apiFetch<Visit>("/visits/emergency", { method: "POST", body: input });
}

export async function cancelVisit(id: string): Promise<Visit> {
  return apiFetch<Visit>(`/visits/${id}/cancel`, { method: "POST" });
}

/**
 * Effektive Fachkraft setzen (Vertretung oder Nachzuweisung eines Notfalls).
 * Beim Regelbesuch prüft das Backend Qualifikation und Arbeitstag, beim Notfall
 * nicht.
 */
export async function assignVisitCaregiver(id: string, caregiverId: string): Promise<Visit> {
  return apiFetch<Visit>(`/visits/${id}/caregiver`, { method: "PUT", body: { caregiverId } });
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
  /** Bereits geschriebene Notiz, null solange keine vorliegt. */
  visitNote: string | null;
  hasIncident: boolean;
  visitNoteWrittenAt: string | null;
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

// ── Besuchsnotizen ─────────────────────────────────────────────────────────

export interface VisitNoteInput {
  note: string;
  /** „Besonderes aufgefallen“. Ist sie gesetzt, ist der Text Pflicht. */
  hasIncident: boolean;
}

export interface VisitNote {
  id: string;
  visitNote: string | null;
  hasIncident: boolean;
  visitNoteWrittenAt: string | null;
}

/**
 * Notiz zu einem Besuch schreiben oder ändern (nur die Fachkraft, die ihn
 * gefahren hat).
 *
 * Das Backend weist ab, wenn der Besuch noch nicht begonnen wurde (409), die
 * Notiz bei gemeldetem Vorfall fehlt (422) oder die Zwei-Stunden-Frist für eine
 * Änderung abgelaufen ist (409).
 */
export async function writeVisitNote(visitId: string, input: VisitNoteInput): Promise<VisitNote> {
  return apiFetch<VisitNote>(`/visits/${visitId}/note`, { method: "PUT", body: input });
}

/** Ein Besuch mit Notiz im Verlauf eines Patienten (Web). */
export interface PatientVisitNote {
  id: string;
  scheduledAt: string;
  status: VisitStatus;
  isEmergency: boolean;
  visitNote: string | null;
  hasIncident: boolean;
  visitNoteWrittenAt: string | null;
  gpsArrivalAt: string | null;
  gpsDepartureAt: string | null;
  caregiver: PersonRef | null;
}

/** Verlauf eines Patienten: seine Besuche mit Notiz, neueste zuerst. */
export async function patientVisitNotes(
  patientId: string,
  params: { page?: number; pageSize?: number } = {},
): Promise<Paginated<PatientVisitNote>> {
  const query = new URLSearchParams();
  if (params.page) query.set("page", String(params.page));
  if (params.pageSize) query.set("pageSize", String(params.pageSize));
  const qs = query.toString();
  return apiFetch<Paginated<PatientVisitNote>>(
    `/patients/${patientId}/visit-notes${qs ? `?${qs}` : ""}`,
  );
}

// ── Vorfall-Alarme (Koordination) ──────────────────────────────────────────

/** Ein gemeldeter, noch nicht quittierter Vorfall. */
export interface OpenIncident {
  id: string;
  scheduledAt: string;
  status: VisitStatus;
  isEmergency: boolean;
  visitNote: string | null;
  visitNoteWrittenAt: string | null;
  patient: PersonRef;
  caregiver: PersonRef | null;
}

/**
 * Offene Vorfälle der Organisation, ÄLTESTE zuerst: eine Arbeitsliste, und was
 * am längsten liegt, ist das Dringendste.
 */
export async function openIncidents(
  params: { page?: number; pageSize?: number } = {},
): Promise<Paginated<OpenIncident>> {
  const query = new URLSearchParams();
  if (params.page) query.set("page", String(params.page));
  if (params.pageSize) query.set("pageSize", String(params.pageSize));
  const qs = query.toString();
  return apiFetch<Paginated<OpenIncident>>(`/visits/alerts/incidents${qs ? `?${qs}` : ""}`);
}

export interface IncidentAck {
  id: string;
  incidentAckAt: string | null;
  incidentAckByUserId: string | null;
}

/**
 * Vorfall zur Kenntnis nehmen. Schliesst die Warnung für die ganze
 * Organisation. Ein zweiter Aufruf ändert nichts und scheitert nicht.
 */
export async function acknowledgeIncident(visitId: string): Promise<IncidentAck> {
  return apiFetch<IncidentAck>(`/visits/${visitId}/incident-ack`, { method: "POST" });
}
