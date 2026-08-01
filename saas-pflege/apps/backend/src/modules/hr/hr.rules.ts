/**
 * Reine Geschäftslogik des HR-Moduls (ohne DB, voll testbar).
 *
 * Hier liegen die Regeln, die für ALLE Eingangskanäle gelten müssen: manuelle
 * Eingabe über die API, CSV-Import und später der Personio-Konnektor. Sie
 * stehen deshalb bewusst außerhalb des Services – ein Importer, der sie
 * umgeht, wäre genau der Bruch, den CLAUDE.md verhindern will.
 *
 * Bezug: Regel métier 5 (Verträge) – die Planung hält Vertragsstunden und
 * Arbeitstage strikt ein.
 */

import { weekdayCode, type WeekDay } from "../../lib/week.js";

// ── Gesetzliche Leitplanken (ArbZG) ───────────────────────────────────────
// §3: werktäglich 8 h, auf bis zu 10 h verlängerbar. §4: Ruhepausen von 30 min
// ab 6 h, 45 min ab 9 h Arbeitszeit. An einer Stelle definiert, damit eine
// Änderung nicht durch drei Kanäle gejagt werden muss.
export const MAX_DAILY_MINUTES = 10 * 60;
export const BREAK_THRESHOLD_1_MINUTES = 6 * 60;
export const BREAK_THRESHOLD_2_MINUTES = 9 * 60;

/** Vorgeschriebene Mindestpause für eine Brutto-Arbeitszeit. */
export function requiredBreakMinutes(grossMinutes: number): number {
  if (grossMinutes > BREAK_THRESHOLD_2_MINUTES) return 45;
  if (grossMinutes > BREAK_THRESHOLD_1_MINUTES) return 30;
  return 0;
}

// ── Zeiträume ─────────────────────────────────────────────────────────────

/** Zeitraum mit einschließendem Ende; `end: null` = laufend/offen. */
export interface Period {
  start: Date;
  end: Date | null;
}

const MAX_TIME = 8.64e15; // Date-Maximum, steht für "kein Ende"

function endValue(period: Period): number {
  return period.end ? period.end.getTime() : MAX_TIME;
}

/** Überschneiden sich zwei Zeiträume (Ende einschließend)? */
export function periodsOverlap(a: Period, b: Period): boolean {
  return a.start.getTime() <= endValue(b) && b.start.getTime() <= endValue(a);
}

/** Erster Zeitraum aus `existing`, der `candidate` schneidet. */
export function findOverlap<T extends Period>(existing: readonly T[], candidate: Period): T | undefined {
  return existing.find((p) => periodsOverlap(p, candidate));
}

/** Der zu `date` gültige Zeitraum (z.B. der geltende Vertrag). */
export function activeAt<T extends Period>(periods: readonly T[], date: Date): T | undefined {
  const t = date.getTime();
  return periods.find((p) => p.start.getTime() <= t && t <= endValue(p));
}

// ── Uhrzeiten (Minuten seit 00:00) ────────────────────────────────────────

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

/**
 * "08:30" -> 510. null bei ungültiger Eingabe – der CSV-Import braucht ein
 * verwertbares "nein" pro Zeile, keine Exception, die den Lauf abbricht.
 */
export function parseTimeToMinutes(value: string): number | null {
  const match = TIME_PATTERN.exec(value.trim());
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

/** 510 -> "08:30". */
export function formatMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export interface ShiftTimes {
  startMinute: number;
  endMinute: number;
  breakMinutes: number;
}

/** Netto-Arbeitszeit einer Schicht in Minuten (Pause abgezogen, nie negativ). */
export function netWorkMinutes(shift: ShiftTimes): number {
  return Math.max(0, shift.endMinute - shift.startMinute - shift.breakMinutes);
}

// ── Prüfungen ─────────────────────────────────────────────────────────────

export interface ContractRule {
  workDays: WeekDay[];
  weeklyHours: number;
}

export interface ScheduleCandidate extends ShiftTimes {
  date: Date;
}

/**
 * Alle Verstöße einer geplanten Schicht. Leeres Array = zulässig.
 *
 * `otherWeekMinutes` ist die bereits verplante Netto-Zeit derselben Woche OHNE
 * diese Schicht; der Aufrufer ermittelt sie (DB oder Import-Lot), damit die
 * Regel selbst rein bleibt.
 */
export function scheduleViolations(
  shift: ScheduleCandidate,
  contract: ContractRule | null,
  otherWeekMinutes = 0,
): string[] {
  const violations: string[] = [];

  if (shift.endMinute <= shift.startMinute) {
    violations.push("Ende muss nach dem Beginn liegen");
    return violations; // Folgeprüfungen wären sinnlos
  }
  if (shift.breakMinutes < 0 || shift.breakMinutes >= shift.endMinute - shift.startMinute) {
    violations.push("Pause ist länger als die Schicht");
    return violations;
  }

  const gross = shift.endMinute - shift.startMinute;
  const net = netWorkMinutes(shift);

  if (net > MAX_DAILY_MINUTES) {
    violations.push(`Tageshöchstarbeitszeit überschritten (${formatMinutes(net)} > 10:00)`);
  }

  const required = requiredBreakMinutes(gross);
  if (shift.breakMinutes < required) {
    violations.push(`Mindestpause nicht eingehalten (${required} min erforderlich)`);
  }

  // Regel métier 5: die Planung hält Arbeitstage und Vertragsstunden strikt ein.
  if (!contract) {
    violations.push("Kein gültiger Vertrag zu diesem Datum");
    return violations;
  }

  const day = weekdayCode(shift.date);
  if (!contract.workDays.includes(day)) {
    violations.push(`${day} ist kein vertraglicher Arbeitstag`);
  }

  const weekMinutes = otherWeekMinutes + net;
  const contractMinutes = Math.round(contract.weeklyHours * 60);
  if (weekMinutes > contractMinutes) {
    violations.push(
      `Wochenarbeitszeit überschritten (${formatMinutes(weekMinutes)} > ${formatMinutes(contractMinutes)})`,
    );
  }

  return violations;
}

export interface AbsenceCandidate {
  startDate: Date;
  endDate: Date;
}

/**
 * Verstöße einer Abwesenheit. `existing` sind die bereits erfassten, nicht
 * abgelehnten Abwesenheiten derselben Fachkraft (ohne die geprüfte selbst).
 */
export function absenceViolations(
  candidate: AbsenceCandidate,
  existing: readonly Period[] = [],
): string[] {
  const violations: string[] = [];

  if (candidate.endDate.getTime() < candidate.startDate.getTime()) {
    violations.push("Enddatum liegt vor dem Startdatum");
    return violations;
  }

  const overlap = findOverlap(existing, {
    start: candidate.startDate,
    end: candidate.endDate,
  });
  if (overlap) violations.push("Überschneidet eine bestehende Abwesenheit");

  return violations;
}

/**
 * Verstöße eines Vertrags. `existing` sind die übrigen Verträge derselben
 * Fachkraft: zu einem Zeitpunkt gilt genau einer.
 */
export function contractViolations(candidate: Period, existing: readonly Period[] = []): string[] {
  const violations: string[] = [];

  if (candidate.end && candidate.end.getTime() < candidate.start.getTime()) {
    violations.push("Vertragsende liegt vor dem Vertragsbeginn");
    return violations;
  }

  if (findOverlap(existing, candidate)) {
    violations.push("Überschneidet einen bestehenden Vertrag derselben Fachkraft");
  }

  return violations;
}
