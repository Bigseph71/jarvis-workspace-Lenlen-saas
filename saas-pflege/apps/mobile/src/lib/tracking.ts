import { AppState, type AppStateStatus } from "react-native";
import * as Location from "expo-location";
import { ApiError, GPS_CONSENT_MISSING, getGpsConsent, sendPosition } from "@len-len/api-client";

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
 *
 * ZWEI Voraussetzungen, die nicht dasselbe sind:
 *  1. die Betriebssystem-Freigabe für den Standort (technisch), und
 *  2. die datenschutzrechtliche Einwilligung der Fachkraft (rechtlich).
 * Die OS-Freigabe ersetzt die Einwilligung NICHT: sie wird gegenüber Apple
 * bzw. Google erteilt, nicht gegenüber dem Arbeitgeber, und sagt nichts
 * darüber aus, ob dieser die Daten speichern darf.
 */

const INTERVAL_MS = 30_000;
const GPS_TIMEOUT_MS = 8000;

interface TrackerState {
  visitId: string;
  timer: ReturnType<typeof setInterval>;
  appStateSub: { remove: () => void };
}

let state: TrackerState | null = null;

/** Warum das Tracking nicht läuft – die App reagiert je Grund anders. */
export type TrackingStart =
  | { ok: true }
  /** Betriebssystem-Freigabe fehlt -> Hinweis auf die Systemeinstellungen. */
  | { ok: false; reason: "permission" }
  /** Einwilligung fehlt oder ist veraltet -> Einwilligungs-Dialog öffnen. */
  | { ok: false; reason: "consent" }
  /**
   * Einwilligung nicht prüfbar (offline). Bewusst getrennt von "consent": es
   * wird ebenfalls nicht getrackt, aber der Nutzer bekommt keinen
   * Einwilligungs-Dialog vorgesetzt, dem er vielleicht längst zugestimmt hat.
   */
  | { ok: false; reason: "unavailable" };

/** Läuft gerade ein Tracking (optional für eine bestimmte Visite)? */
export function isTracking(visitId?: string): boolean {
  if (!state) return false;
  return visitId ? state.visitId === visitId : true;
}

/** Callback, über den die UI vom Wegfall der Einwilligung erfährt. */
let onConsentLost: (() => void) | null = null;

export function setOnConsentLost(handler: (() => void) | null): void {
  onConsentLost = handler;
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
  } catch (err) {
    // Ein fehlender Rechtsgrund ist KEIN vorübergehender Netzfehler: weiter zu
    // pollen hiesse, im 30-Sekunden-Takt gegen eine Ablehnung zu laufen, die
    // sich von selbst nie ändert. Also anhalten und die UI verständigen –
    // etwa wenn die Einwilligung auf einem anderen Gerät widerrufen wurde.
    if (err instanceof ApiError && err.code === GPS_CONSENT_MISSING) {
      stopTracking();
      onConsentLost?.();
      return;
    }
    // Übrige Fehler (Netz/GPS) dürfen den nächsten Tick nicht verhindern.
  }
}

/**
 * Startet das Tracking für eine Visite, sofern OS-Freigabe UND Einwilligung
 * vorliegen. Idempotent für dieselbe Visite; ein Wechsel der Visite startet neu.
 *
 * Die Einwilligung wird VOR dem ersten Punkt geprüft, nicht erst am Fehler des
 * ersten Sendeversuchs: sonst entstünde bei jedem Besuchsbeginn eine
 * abgelehnte Anfrage, und der Nutzer sähe den Dialog erst 30 Sekunden später.
 */
export async function startTracking(visitId: string): Promise<TrackingStart> {
  if (state?.visitId === visitId) return { ok: true };
  stopTracking();

  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== "granted") return { ok: false, reason: "permission" };

  try {
    const consent = await getGpsConsent();
    if (!consent.granted) return { ok: false, reason: "consent" };
  } catch {
    // Nicht abfragbar (offline/Serverfehler): NICHT tracken. Im Zweifel gegen
    // die Erhebung zu entscheiden ist der einzige Weg, der nie zu Daten ohne
    // nachgewiesenen Rechtsgrund führt.
    return { ok: false, reason: "unavailable" };
  }

  void captureAndSend(visitId); // sofort ein erster Punkt
  const timer = setInterval(() => void captureAndSend(visitId), INTERVAL_MS);

  const onAppState = (next: AppStateStatus): void => {
    if (next === "active") void captureAndSend(visitId);
  };
  const appStateSub = AppState.addEventListener("change", onAppState);

  state = { visitId, timer, appStateSub };
  return { ok: true };
}

/** Stoppt jedes laufende Tracking (Ende des Besuchs / Verlassen des Screens). */
export function stopTracking(): void {
  if (!state) return;
  clearInterval(state.timer);
  state.appStateSub.remove();
  state = null;
}
