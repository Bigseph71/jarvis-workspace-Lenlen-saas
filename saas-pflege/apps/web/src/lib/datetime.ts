/** Datums-Hilfsfunktionen (Wochenansicht des Planungsbildschirms). */

/** Montag 00:00 (lokal) der Woche, die `date` enthält. */
export function startOfWeek(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const mondayIndex = (d.getDay() + 6) % 7; // So=0 -> 6, Mo=1 -> 0
  d.setDate(d.getDate() - mondayIndex);
  return d;
}

export function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

/** Formatiert einen ISO-Zeitstempel locale-bewusst (Datum + Uhrzeit). */
export function formatDateTime(iso: string, locale: string): string {
  return new Date(iso).toLocaleString(locale, { dateStyle: "short", timeStyle: "short" });
}

/** Formatiert ein Datum (ohne Uhrzeit) locale-bewusst. */
export function formatDate(date: Date, locale: string): string {
  return date.toLocaleDateString(locale, { day: "2-digit", month: "2-digit", year: "numeric" });
}
