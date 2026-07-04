import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Location from "expo-location";
import {
  ApiError,
  checkInVisit,
  checkOutVisit,
  type PointagePayload,
} from "@len-len/api-client";

/**
 * Pointage mit GPS-Position und Offline-Toleranz.
 *
 * - Position ist best effort: verweigerte Berechtigung oder GPS-Timeout
 *   blockieren das Pointage nicht (Koordinaten fehlen dann einfach).
 * - Netzwerkfehler: das Pointage landet mit echtem Zeitstempel (recordedAt)
 *   in einer persistenten Warteschlange und wird beim nächsten flush
 *   nachgereicht (Zone blanche).
 * - API-Fehler (4xx/5xx): kein Queueing, der Fehler geht an den Aufrufer.
 */

export type PointageAction = "check-in" | "check-out";

interface QueuedPointage {
  visitId: string;
  action: PointageAction;
  payload: PointagePayload;
}

const QUEUE_KEY = "lenlen.pointageQueue";
const GPS_TIMEOUT_MS = 8000;

async function readQueue(): Promise<QueuedPointage[]> {
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    return raw ? (JSON.parse(raw) as QueuedPointage[]) : [];
  } catch {
    return [];
  }
}

async function writeQueue(queue: QueuedPointage[]): Promise<void> {
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

/** Anzahl wartender Offline-Pointages (für UI-Hinweis). */
export async function pendingPointageCount(): Promise<number> {
  return (await readQueue()).length;
}

/** Best-effort-Position: null bei verweigerter Berechtigung oder Timeout. */
async function getPosition(): Promise<Pick<PointagePayload, "latitude" | "longitude" | "accuracy"> | null> {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== "granted") return null;
    const pos = await Promise.race([
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), GPS_TIMEOUT_MS)),
    ]);
    if (!pos) return null;
    return {
      latitude: pos.coords.latitude,
      longitude: pos.coords.longitude,
      accuracy: pos.coords.accuracy ?? undefined,
    };
  } catch {
    return null;
  }
}

async function send(item: QueuedPointage): Promise<void> {
  if (item.action === "check-in") await checkInVisit(item.visitId, item.payload);
  else await checkOutVisit(item.visitId, item.payload);
}

export type PointageResult = "sent" | "queued";

/**
 * Führt ein Pointage aus. Wirft ApiError bei fachlicher Ablehnung (z.B. 409),
 * liefert "queued" bei Netzwerkausfall.
 */
export async function performPointage(
  visitId: string,
  action: PointageAction,
): Promise<PointageResult> {
  const position = await getPosition();
  const item: QueuedPointage = {
    visitId,
    action,
    payload: { ...position, recordedAt: new Date().toISOString() },
  };
  try {
    await send(item);
    return "sent";
  } catch (err) {
    if (err instanceof ApiError) throw err;
    const queue = await readQueue();
    queue.push(item);
    await writeQueue(queue);
    return "queued";
  }
}

/**
 * Reicht wartende Pointages nach. Fachlich abgelehnte Einträge (ApiError,
 * z.B. inzwischen stornierter Besuch) werden verworfen; bei Netzwerkfehler
 * bleibt der Rest in der Warteschlange.
 */
export async function flushPointageQueue(): Promise<void> {
  const queue = await readQueue();
  if (queue.length === 0) return;

  const remaining: QueuedPointage[] = [];
  for (let i = 0; i < queue.length; i++) {
    const item = queue[i] as QueuedPointage;
    try {
      await send(item);
    } catch (err) {
      if (!(err instanceof ApiError)) {
        // Immer noch offline: diesen und alle folgenden behalten.
        remaining.push(...queue.slice(i));
        break;
      }
      // ApiError: Eintrag ist fachlich obsolet -> verwerfen.
    }
  }
  await writeQueue(remaining);
}
