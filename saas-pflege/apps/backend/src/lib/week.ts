// Datums-Helfer für die Besuchsplanung. Berechnungen in UTC, damit die
// Wochengrenze deterministisch ist (Anmerkung: bei DE-Zeitzone ggf. später auf
// Europe/Berlin umstellen, sobald Schichtzeiten modelliert werden).

export type WeekDay = "MON" | "TUE" | "WED" | "THU" | "FRI" | "SAT" | "SUN";

// getUTCDay(): 0 = Sonntag .. 6 = Samstag
const WEEKDAYS: readonly WeekDay[] = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

export function weekdayCode(date: Date): WeekDay {
  return WEEKDAYS[date.getUTCDay()]!;
}

/** Montag 00:00:00 UTC der Woche, in der `date` liegt. */
export function startOfISOWeek(date: Date): Date {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay(); // 0=So..6=Sa
  const shift = day === 0 ? -6 : 1 - day; // auf Montag schieben
  d.setUTCDate(d.getUTCDate() + shift);
  return d;
}

/** Halboffenes Wochenintervall [Montag, nächster Montag). */
export function weekRange(date: Date): { start: Date; end: Date } {
  const start = startOfISOWeek(date);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 7);
  return { start, end };
}

/** Halboffenes Tagesintervall [00:00, nächster Tag) in UTC. */
export function dayRange(date: Date): { start: Date; end: Date } {
  const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  return { start, end };
}
