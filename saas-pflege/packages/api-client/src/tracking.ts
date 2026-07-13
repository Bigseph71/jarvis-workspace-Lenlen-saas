import { apiFetch } from "./client";
import { getApiConfig } from "./config";

/** Positionsmeldung der Fachkraft (Mobile, alle 30 s im aktiven Besuch). */
export interface PositionInput {
  latitude: number;
  longitude: number;
  accuracy?: number;
  visitId?: string;
  recordedAt?: string;
}

export interface Position {
  id: string;
  caregiverId: string;
  visitId: string | null;
  latitude: number;
  longitude: number;
  accuracy: number | null;
  distanceToPatientM: number | null;
  geofenceBreach: boolean;
  recordedAt: string;
}

export interface LivePosition extends Position {
  caregiver: { id: string; firstName: string; lastName: string };
}

/** Meldet die aktuelle Position der eingeloggten Fachkraft (POST /tracking/position). */
export async function sendPosition(input: PositionInput): Promise<Position> {
  return apiFetch<Position>("/tracking/position", { method: "POST", body: input });
}

/** Snapshot der aktuellen Positionen aller Fachkräfte (Koordination). */
export async function getLivePositions(): Promise<LivePosition[]> {
  const res = await apiFetch<{ positions: LivePosition[] }>("/tracking/live");
  return res.positions;
}

/** Über WebSocket gepushte Nachricht (Snapshot beim Verbinden, dann Positionen). */
export type TrackingSocketMessage =
  | { type: "snapshot"; positions: LivePosition[] }
  | ({ type: "position" } & Omit<Position, "id" | "caregiverId"> & { caregiverId: string });

/**
 * Baut die WebSocket-URL des Live-Streams (Koordination). Der Token wird als
 * Query mitgegeben, da Browser bei WS keinen Authorization-Header setzen können.
 * Leitet http(s):// der baseUrl auf ws(s):// um.
 */
export function liveTrackingSocketUrl(token: string): string {
  const { baseUrl } = getApiConfig();
  const wsBase = baseUrl.replace(/^http/i, "ws");
  return `${wsBase}/tracking/live/ws?token=${encodeURIComponent(token)}`;
}
