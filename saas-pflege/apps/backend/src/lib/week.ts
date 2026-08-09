import { env } from "../config/env.js";

/**
 * Datums-Helfer für die Besuchsplanung.
 *
 * Gerechnet wird in der ANWENDUNGS-ZEITZONE (APP_TIME_ZONE, Vorgabe
 * Europe/Berlin), nicht in UTC. Der Unterschied ist fachlich, nicht kosmetisch:
 * ein Besuch um 01:00 Uhr deutscher Zeit liegt in UTC noch am Vortag. In UTC
 * gerechnet fiele er aus "heute" heraus, zählte in die Vorwoche (Regel 1 und 3)
 * und träfe den falschen Wochentag (Regel 5) – eine Fachkraft, die montags
 * arbeitet, bekäme "arbeitet nicht am SUN" zu hören.
 *
 * Umgesetzt über Intl statt einer Datums-Bibliothek: die drei benötigten
 * Operationen sind kurz, und der Zeitzonen-Datenbestand steckt bereits in der
 * Runtime.
 */

export type WeekDay = "MON" | "TUE" | "WED" | "THU" | "FRI" | "SAT" | "SUN";

// getUTCDay(): 0 = Sonntag .. 6 = Samstag
const WEEKDAYS: readonly WeekDay[] = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

/** Zeitzone der Anwendung; je Aufruf überschreibbar (Tests, Sonderfälle). */
export const APP_TIME_ZONE = env.APP_TIME_ZONE;

interface YMD {
  year: number;
  month: number; // 1-12
  day: number;
}

/**
 * Versatz der Zone gegenüber UTC zum Zeitpunkt `instant`, in Millisekunden.
 * Positiv östlich von Greenwich (Europe/Berlin: +1 h bzw. +2 h in der Sommerzeit).
 */
function zoneOffsetMs(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant);

  const get = (type: string): number => Number(parts.find((p) => p.type === type)?.value ?? "0");
  // Manche Runtimes liefern für Mitternacht "24" statt "00".
  const asIfUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour") % 24,
    get("minute"),
    get("second"),
  );
  return asIfUtc - instant.getTime();
}

/** Kalenderdatum, wie es in der Zone auf dem Kalender steht. */
function zonedYMD(instant: Date, timeZone: string): YMD {
  const shifted = new Date(instant.getTime() + zoneOffsetMs(instant, timeZone));
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  };
}

/**
 * UTC-Zeitpunkt, zu dem in der Zone Mitternacht des angegebenen Kalendertags
 * ist. `day` darf über den Monat hinauslaufen (Date.UTC normalisiert).
 *
 * Zwei Durchgänge: der Versatz hängt selbst vom Zeitpunkt ab (Sommerzeit).
 * Der erste Versuch schätzt ihn, der zweite prüft, ob die Schätzung an einem
 * Umstellungstag danebenlag.
 */
function zonedMidnightUtc({ year, month, day }: YMD, timeZone: string): Date {
  const wall = Date.UTC(year, month - 1, day);
  const firstGuess = new Date(wall - zoneOffsetMs(new Date(wall), timeZone));
  const corrected = new Date(wall - zoneOffsetMs(firstGuess, timeZone));
  return corrected;
}

/** Wochentag, wie er in der Zone gilt. */
export function weekdayCode(date: Date, timeZone: string = APP_TIME_ZONE): WeekDay {
  const { year, month, day } = zonedYMD(date, timeZone);
  return WEEKDAYS[new Date(Date.UTC(year, month - 1, day)).getUTCDay()]!;
}

/** Montag 00:00 ORTSZEIT der Woche, in der `date` liegt. */
export function startOfISOWeek(date: Date, timeZone: string = APP_TIME_ZONE): Date {
  const ymd = zonedYMD(date, timeZone);
  const weekday = new Date(Date.UTC(ymd.year, ymd.month - 1, ymd.day)).getUTCDay();
  const shift = weekday === 0 ? -6 : 1 - weekday; // Sonntag ist Wochenende, nicht Wochenanfang
  return zonedMidnightUtc({ ...ymd, day: ymd.day + shift }, timeZone);
}

/**
 * Halboffenes Wochenintervall [Montag, nächster Montag) in Ortszeit.
 *
 * Das Ende wird über den Kalender bestimmt, nicht durch Addition von 7×24 h:
 * die Woche einer Zeitumstellung ist 167 bzw. 169 Stunden lang, und eine feste
 * Addition verschöbe die Grenze um eine Stunde in die Nachbarwoche.
 */
export function weekRange(
  date: Date,
  timeZone: string = APP_TIME_ZONE,
): { start: Date; end: Date } {
  const start = startOfISOWeek(date, timeZone);
  const startYmd = zonedYMD(start, timeZone);
  const end = zonedMidnightUtc({ ...startYmd, day: startYmd.day + 7 }, timeZone);
  return { start, end };
}

/**
 * Halboffenes Tagesintervall [00:00, nächster Tag) in Ortszeit.
 *
 * Ebenfalls über den Kalender: ein Umstellungstag hat 23 bzw. 25 Stunden.
 */
export function dayRange(
  date: Date,
  timeZone: string = APP_TIME_ZONE,
): { start: Date; end: Date } {
  const ymd = zonedYMD(date, timeZone);
  return {
    start: zonedMidnightUtc(ymd, timeZone),
    end: zonedMidnightUtc({ ...ymd, day: ymd.day + 1 }, timeZone),
  };
}
