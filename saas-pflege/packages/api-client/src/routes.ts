import { apiFetch } from "./client";

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
