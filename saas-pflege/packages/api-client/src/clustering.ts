import { apiFetch } from "./client";
import { getApiConfig } from "./config";

/** Ein Patient innerhalb eines Gebiets, mit dem Besuch, der ihn dorthin bringt. */
export interface ClusteredPatient {
  patientId: string;
  visitId: string;
  firstName: string;
  lastName: string;
  latitude: number;
  longitude: number;
  scheduledAt: string;
  assignedCaregiverId: string | null;
}

export interface SuggestedCaregiver {
  id: string;
  firstName: string;
  lastName: string;
  qualification: string;
  /** Abstand zwischen dem Schwerpunkt des Gebiets und dem der Fachkraft. */
  distanceKm: number;
}

export interface Cluster {
  index: number;
  patientCount: number;
  /** Durchmesser: größter Abstand zwischen zwei Patienten des Gebiets. */
  maxDistanceKm: number;
  centroid: { lat: number; lng: number };
  patients: ClusteredPatient[];
  suggestedCaregiver: SuggestedCaregiver | null;
  /**
   * Bereits bestehende Tour der vorgeschlagenen Fachkraft an diesem Tag.
   * `null` = es gibt noch keine; dann lässt sich für dieses Gebiet auch nichts
   * optimieren, denn der VRPTW arbeitet auf einer Tour, nicht auf einem Gebiet.
   */
  routeId: string | null;
}

export interface DailyClusteringResult {
  date: string;
  algorithm: "dbscan" | "kmeans";
  patientCount: number;
  clusters: Cluster[];
  /** Von DBSCAN keinem Gebiet zugeordnet – bewusst sichtbar, nicht verschwiegen. */
  unassigned: ClusteredPatient[];
}

/** Antwort, wenn der Tag zu groß für die synchrone Berechnung war. */
export interface ClusteringQueued {
  jobId: string;
  status: "queued";
  date: string;
  patientCount: number;
}

export interface DailyClusteringInput {
  date: string;
  algorithm?: "dbscan" | "kmeans";
  k?: number;
  epsilonKm?: number;
  minPoints?: number;
}

export type DailyClusteringResponse = DailyClusteringResult | ClusteringQueued;

/**
 * Unterscheidet die beiden Antwortformen.
 *
 * Am Vorhandensein von `clusters` und nicht am HTTP-Status: apiFetch reicht
 * den Status nicht durch, und ein Feld des Nutzdatensatzes ist ohnehin die
 * belastbarere Unterscheidung – sie überlebt einen Proxy, der 202 zu 200 macht.
 */
export function isClusteringQueued(res: DailyClusteringResponse): res is ClusteringQueued {
  return !("clusters" in res);
}

/**
 * Startet die tägliche Gebietsaufteilung (POST /clustering/daily).
 *
 * Die Organisation wird NICHT mitgeschickt: das Backend liest sie aus dem JWT.
 */
export async function computeDailyClustering(
  input: DailyClusteringInput,
): Promise<DailyClusteringResponse> {
  return apiFetch<DailyClusteringResponse>("/clustering/daily", { method: "POST", body: input });
}

export type ClusteringJobStatus = "pending" | "processing" | "done" | "failed" | "unknown";

export interface ClusteringSocketMessage {
  type: "status";
  date: string;
  status: ClusteringJobStatus;
  at: string;
  result?: DailyClusteringResult;
  error?: string;
}

/**
 * WebSocket-URL des Statusstroms einer asynchronen Gebietsaufteilung.
 * Token als Query, weil Browser bei WebSockets keinen Authorization-Header
 * setzen können (wie beim Live-Tracking).
 */
export function clusteringSocketUrl(token: string, date: string): string {
  const { baseUrl } = getApiConfig();
  const wsBase = baseUrl.replace(/^http/i, "ws");
  return `${wsBase}/clustering/status/ws?token=${encodeURIComponent(token)}&date=${encodeURIComponent(date)}`;
}
