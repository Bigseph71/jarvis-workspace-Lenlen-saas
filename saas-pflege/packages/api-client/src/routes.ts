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
  /**
   * Besuche, die nicht geprüft werden konnten – ihrem Patienten fehlen die
   * Koordinaten. Eine Tour, von der die Hälfte ungeprüft blieb, darf nicht als
   * "geht auf" gelesen werden.
   */
  uncheckedVisits: number;
}

/** Warum ein Besuch der Fachkraft dieser Tour nicht zusteht. */
export type StaffingReason = "absence" | "off_day" | "qualification";

export interface StaffingIssue {
  visitId: string;
  patientName: string;
  reason: StaffingReason;
  /** Art der genehmigten Abwesenheit (SICK, VACATION …). Nur bei "absence". */
  absenceType?: string;
  /** Wochentag des Besuchs (MON..SUN). Nur bei "off_day". */
  weekday?: string;
  /** Qualifikation der fahrenden Fachkraft. Nur bei "qualification". */
  actualQualification?: string;
  /** Qualifikation der Stamm-Fachkraft. Nur bei "qualification". */
  requiredQualification?: string;
}

/**
 * Darf die eingeteilte Fachkraft diese Tour fahren?
 *
 * Zweite Frage neben der Zeit, und die haertere: eine Verspaetung ist ein
 * Aergernis, ein Einsatz an einem vertraglich freien Tag (Regel 5) oder mit
 * der falschen Qualifikation (Regel 4) ist ein Regelverstoss -- und eine Tour,
 * die einer genehmigt Abwesenden zugeteilt bleibt, faehrt gar niemand. Alles
 * drei haengt an der Person und am Kalender: eine andere Reihenfolge heilt es
 * nicht.
 */
export interface StaffingReport {
  /** false = der Tour ist keine Fachkraft zugeteilt; es gab nichts zu pruefen. */
  checked: boolean;
  issues: StaffingIssue[];
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
  /** Bei jedem Lesen neu gerechnet, nie gespeichert. */
  feasibility: FeasibilityReport;
  /** Ebenfalls bei jedem Lesen neu gerechnet: Vertraege aendern sich. */
  staffing: StaffingReport;
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
  /** Geht die Tour zeitlich auf? Die Einzelheiten liefert getRoute. */
  feasible: boolean;
  violationCount: number;
  uncheckedVisits: number;
  /** Besuche, die diese Fachkraft nicht fahren duerfte. Gruende via getRoute. */
  staffingIssueCount: number;
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
