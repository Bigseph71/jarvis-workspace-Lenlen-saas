import type { MyVisit } from "@len-len/api-client";

/**
 * Reine Logik der Tagesansicht.
 *
 * Aus den Bildschirmen herausgezogen, weil sie ohne React Native prüfbar ist
 * und weil beide Bildschirme sie brauchen. Was hier falsch ist, zeigt sich
 * sonst erst auf einem Telefon im Treppenhaus.
 */

/**
 * Der Besuch, um den es JETZT geht: der laufende, sonst der nächste geplante.
 *
 * Der laufende hat Vorrang, auch wenn ein früher terminierter noch auf
 * PLANNED steht. Wer schon beim Patienten ist, soll nicht auf eine Karte
 * schauen, die ihn woanders hinschickt.
 *
 * null, wenn nichts offen ist – dann ist der Tag durch, und der Bildschirm
 * zeigt keine grosse Karte mehr.
 */
export function currentVisit(visits: readonly MyVisit[]): MyVisit | null {
  return (
    visits.find((v) => v.status === "IN_PROGRESS") ??
    visits.find((v) => v.status === "PLANNED") ??
    null
  );
}

/**
 * Abweichung zwischen Termin und tatsächlicher Ankunft, in ganzen Minuten.
 *
 * null vor der Ankunft: dann gibt es keine Abweichung, sondern nur eine
 * Erwartung. Eine "0 Min." an dieser Stelle wäre eine Behauptung über etwas,
 * das noch nicht stattgefunden hat.
 *
 * Negative Werte sind zulässig und bedeuten "früher als geplant" – die
 * Anzeige darf sie nicht als Verspätung einfärben.
 */
export function driftMinutes(visit: Pick<MyVisit, "scheduledAt" | "gpsArrivalAt">): number | null {
  if (!visit.gpsArrivalAt) return null;
  const planned = new Date(visit.scheduledAt).getTime();
  const actual = new Date(visit.gpsArrivalAt).getTime();
  if (Number.isNaN(planned) || Number.isNaN(actual)) return null;
  return Math.round((actual - planned) / 60000);
}

/** Verbleibende, also noch nicht erledigte Besuche. */
export function remainingCount(visits: readonly MyVisit[]): number {
  return visits.filter((v) => v.status !== "COMPLETED" && v.status !== "CANCELED").length;
}
