import { apiFetch } from "./client";

/**
 * Warum eine Tour in der vorgeschlagenen Reihenfolge nicht aufgeht.
 *
 * Nennt BEIDE Besuche: den zu spät erreichten und den davor, aus dem die
 * Verspätung stammt. Ohne den Vorgänger bliebe offen, wo man ansetzen müsste.
 */
export interface FeasibilityViolation {
  visitId: string;
  patientName: string;
  previousVisitId: string;
  scheduledAt: string;
  /** Frühestmögliche Ankunft nach Pflege und Fahrt. */
  earliestArrival: string;
  lateByMinutes: number;
  travelMinutes: number;
  previousDurationMinutes: number;
}

/**
 * Geht die Tour zeitlich auf?
 *
 * Gerechnet wird Pflegezeit beim Patienten + Fahrzeit zur nächsten Adresse
 * gegen den nächsten Termin. Die Fahrzeit ist eine deterministische Schätzung
 * (Luftlinie, Umwegfaktor, Durchschnittsgeschwindigkeit), kein Routing-Dienst:
 * sie kostet nichts, braucht kein Netz und liefert bei gleicher Eingabe
 * dasselbe Ergebnis -- ohne das könnte man zwei Vorschläge nicht vergleichen.
 */
export interface FeasibilityReport {
  feasible: boolean;
  violations: FeasibilityViolation[];
  totalTravelMinutes: number;
  totalCareMinutes: number;
}

/** Zustand einer Tour (VRPTW-Ergebnis). */
export interface RouteStatus {
  id: string;
  caregiverId: string | null;
  vehicleId: string | null;
  date: string;
  visitsOrder: string[];
  optimized: boolean;
  vrptwScore: number | null;
  totalKm: number | null;
}

export interface OptimizeQueued {
  routeId: string;
  jobId: string;
  status: "queued";
}

/**
 * Stößt die VRPTW-Optimierung einer Tour an (POST /routes/:id/optimize).
 *
 * Antwortet immer 202: die Optimierung läuft asynchron und blockiert die API
 * nie. Das Ergebnis kommt über getRoute oder den WebSocket-Statusstrom.
 */
export async function optimizeRoute(routeId: string): Promise<OptimizeQueued> {
  return apiFetch<OptimizeQueued>(`/routes/${routeId}/optimize`, { method: "POST" });
}

export async function getRoute(routeId: string): Promise<RouteStatus> {
  return apiFetch<RouteStatus>(`/routes/${routeId}`);
}

// ── Tagesliste der Touren (Übersicht) ─────────────────────────────────────

export interface RouteRow {
  id: string;
  /** Kalendertag, YYYY-MM-DD. */
  date: string;
  caregiver: { id: string; firstName: string; lastName: string } | null;
  vehicleId: string | null;
  optimized: boolean;
  vrptwScore: number | null;
  totalKm: number | null;
  visitCount: number;
}

export interface RouteDay {
  date: string;
  /** Über den GANZEN Tag gerechnet, nicht über die gelieferte Seite. */
  totals: { routes: number; optimized: number; totalKm: number };
  data: RouteRow[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

/**
 * Touren eines Tages (GET /routes).
 *
 * Ohne `date`: heute. Die Obergrenze für `pageSize` ist hier 500 und nicht 100
 * wie sonst – ein Träger im Enterprise-Plan hat bis zu 500 Fachkräfte, und eine
 * Tagesliste, die abschneidet, wäre eine falsche Lage.
 */
export async function listRoutes(
  params: { date?: string; page?: number; pageSize?: number } = {},
): Promise<RouteDay> {
  const query = new URLSearchParams();
  if (params.date) query.set("date", params.date);
  if (params.page) query.set("page", String(params.page));
  if (params.pageSize) query.set("pageSize", String(params.pageSize));
  const qs = query.toString();
  return apiFetch<RouteDay>(`/routes${qs ? `?${qs}` : ""}`);
}
