import { AppState, type AppStateStatus } from "react-native";
import * as Location from "expo-location";
import { sendPosition } from "@len-len/api-client";

/**
 * Echtzeit-GPS-Tracking während eines aktiven Besuchs.
 *
 * - Sendet die Position alle INTERVAL_MS an /tracking/position (best effort;
 *   Netzfehler werden verschluckt, Tracking ist flüchtig – anders als das
 *   Pointage, das offline nachgereicht wird).
 * - Startet/stoppt gebunden an den aktiven Besuch (siehe today.tsx). Außerhalb
 *   eines Besuchs läuft KEIN Tracking.
 * - AppState-bewusst: beim Zurückkehren in den Vordergrund wird sofort eine
 *   Position gesendet (Foreground-GPS). Echtes Hintergrund-Tracking erfordert
 *   expo-task-manager + Background-Location (separater Ausbau, Native-Build).
 */

const INTERVAL_MS = 30_000;
const GPS_TIMEOUT_MS = 8000;

interface TrackerState {
  visitId: string;
  timer: ReturnType<typeof setInterval>;
  appStateSub: { remove: () => void };
}

let state: TrackerState | null = null;

/** Läuft gerade ein Tracking (optional für eine bestimmte Visite)? */
export function isTracking(visitId?: string): boolean {
  if (!state) return false;
  return visitId ? state.visitId === visitId : true;
}

async function captureAndSend(visitId: string): Promise<void> {
  try {
    const { status } = await Location.getForegroundPermissionsAsync();
    if (status !== "granted") return;
    const pos = await Promise.race([
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), GPS_TIMEOUT_MS)),
    ]);
    if (!pos) return;
    await sendPosition({
      visitId,
      latitude: pos.coords.latitude,
      longitude: pos.coords.longitude,
      accuracy: pos.coords.accuracy ?? undefined,
      recordedAt: new Date().toISOString(),
    });
  } catch {
    // Best effort: Netz-/GPS-Fehler dürfen den nächsten Tick nicht verhindern.
  }
}

/**
 * Startet das Tracking für eine Visite. Fordert einmalig die Standortfreigabe
 * an; wird sie verweigert, liefert die Funktion false (kein Tracking).
 * Idempotent für dieselbe Visite; ein Wechsel der Visite startet neu.
 */
export async function startTracking(visitId: string): Promise<boolean> {
  if (state?.visitId === visitId) return true;
  stopTracking();

  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== "granted") return false;

  void captureAndSend(visitId); // sofort ein erster Punkt
  const timer = setInterval(() => void captureAndSend(visitId), INTERVAL_MS);

  const onAppState = (next: AppStateStatus): void => {
    if (next === "active") void captureAndSend(visitId);
  };
  const appStateSub = AppState.addEventListener("change", onAppState);

  state = { visitId, timer, appStateSub };
  return true;
}

/** Stoppt jedes laufende Tracking (Ende des Besuchs / Verlassen des Screens). */
export function stopTracking(): void {
  if (!state) return;
  clearInterval(state.timer);
  state.appStateSub.remove();
  state = null;
}
