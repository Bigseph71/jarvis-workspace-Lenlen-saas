import type { MyHistoryVisit } from "@len-len/api-client";

/**
 * Reine Logik des Verlaufs (erledigte Besuche der Fachkraft).
 *
 * Wie tour.ts aus dem Bildschirm herausgezogen: eine falsch gerechnete Dauer
 * ist auf einem Telefon nicht zu erkennen – 45 Minuten sehen genauso plausibel
 * aus wie 54.
 */

/**
 * Dauer eines Besuchs in ganzen Minuten, aus den beiden GPS-Zeitstempeln.
 *
 * `null`, wenn sie nicht bestimmbar ist, und die Anzeige schreibt dann einen
 * Strich. Das ist kein Randfall, sondern kommt vor: eine vergessene Abfahrt
 * wird von der Koordination nachgetragen, und bis dahin gibt es keine Dauer.
 * Eine "0 Min." an dieser Stelle wäre eine Behauptung über einen Besuch, der
 * stattgefunden hat.
 *
 * Eine Abfahrt VOR der Ankunft ergibt ebenfalls null statt einer negativen
 * Zahl. Der Fall entsteht durch nachgereichte Offline-Pointages mit der Uhr
 * des Geräts (lib/pointage.ts) und ist ein Datenfehler, keine Dauer.
 */
export function visitDurationMinutes(
  visit: Pick<MyHistoryVisit, "gpsArrivalAt" | "gpsDepartureAt">,
): number | null {
  if (!visit.gpsArrivalAt || !visit.gpsDepartureAt) return null;
  const from = new Date(visit.gpsArrivalAt).getTime();
  const to = new Date(visit.gpsDepartureAt).getTime();
  if (Number.isNaN(from) || Number.isNaN(to)) return null;
  if (to < from) return null;
  return Math.round((to - from) / 60000);
}

/**
 * Dauer in Stunden und Restminuten, für die Beschriftung.
 *
 * Getrennt von der Formatierung, weil die Sprache darüber entscheidet, ob
 * "1 Std. 05 Min." oder "1 h 05" dasteht – die Zerlegung ist in allen dreien
 * dieselbe.
 */
export function durationParts(minutes: number): { hours: number; minutes: number } {
  const safe = Math.max(0, Math.round(minutes));
  return { hours: Math.floor(safe / 60), minutes: safe % 60 };
}
