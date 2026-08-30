import type { Prisma, Qualification } from "@len-len/database";
import { weekdayCode } from "../../lib/week.js";

// Reine Geschäftsregeln (ohne DB / Seiteneffekte) – damit unit-testbar.

export function workDaysOf(input: { workDays: Prisma.JsonValue }): string[] {
  return Array.isArray(input.workDays) ? (input.workDays as string[]) : [];
}

/** Regel métier 5 (Teil): Besuch nur an einem Arbeitstag der Fachkraft. */
export function isWorkDay(input: { workDays: Prisma.JsonValue }, scheduledAt: Date): boolean {
  return workDaysOf(input).includes(weekdayCode(scheduledAt));
}

/** Regel métier 4: Vertretung muss dieselbe Qualifikation haben. */
export function sameQualification(a: Qualification, b: Qualification): boolean {
  return a === b;
}

/**
 * Gelten beim Zuweisen einer Fachkraft die Stamm-Regeln (gleiche Qualifikation,
 * Arbeitstag)?
 *
 * Beim Notfall nicht. Er entsteht ausserhalb des Zyklus und darf laut Regel
 * métier 2 von einer beliebigen aktiven Fachkraft gefahren werden – genau das
 * erlaubt createEmergencyVisit bereits beim Anlegen. Würde das Nachzuweisen
 * strenger prüfen, liesse sich ein Notfall ohne Fachkraft anlegen und danach
 * niemandem mehr geben: er bliebe in jeder Tagesroute unsichtbar.
 *
 * Ohne Stamm-Fachkraft gibt es ebenfalls nichts zu vergleichen.
 */
export function enforcesStammRules(visit: {
  isEmergency: boolean;
  assignedCaregiverId: string | null;
}): boolean {
  return !visit.isEmergency && visit.assignedCaregiverId !== null;
}

// ── Besuchsnotizen ─────────────────────────────────────────────────────────

/** Frist, innerhalb derer eine geschriebene Notiz noch geändert werden darf. */
export const NOTE_EDIT_WINDOW_MS = 2 * 60 * 60 * 1000;

export interface VisitNoteState {
  /** Pointage Ankunft. Ohne ihn hat die Fachkraft den Patienten nie erreicht. */
  gpsArrivalAt: Date | null;
  /** Pointage Abfahrt. Setzt die Frist in Gang. */
  gpsDepartureAt: Date | null;
  /** Bereits geschriebene Notiz (null = noch keine). */
  visitNote: string | null;
}

export type NoteRejection =
  | "not_started"
  | "incident_without_note"
  | "edit_window_expired"
  | "empty_note";

/**
 * Darf zu diesem Besuch eine Notiz geschrieben oder geändert werden?
 *
 * Drei Regeln, in dieser Reihenfolge.
 *
 * 1. Der Besuch muss BEGONNEN sein: ohne `gpsArrivalAt` war niemand vor Ort,
 *    und eine Notiz über einen nicht stattgefundenen Besuch ist eine Erfindung.
 *    Bewusst die Ankunft und nicht die Abfahrt: die Notiz entsteht im
 *    Normalfall beim Gehen, aber wer sie schon am Bett tippt, soll nicht
 *    warten müssen – und wer den Abfahrts-Pointage vergisst, soll seine
 *    Beobachtung nicht verlieren.
 *
 * 2. Ist "Besonderes aufgefallen" gesetzt, ist der Text Pflicht. Ein Vorfall
 *    ohne Beschreibung wäre für die Koordination ein Alarm ohne Inhalt.
 *
 * 3. Eine BESTEHENDE Notiz lässt sich nur zwei Stunden lang ändern, gerechnet
 *    ab der Abfahrt. Danach ist sie Teil der Pflegedokumentation und wird nicht
 *    mehr umgeschrieben. Solange der Besuch läuft (keine Abfahrt), läuft keine
 *    Frist: es gibt noch nichts, was abgeschlossen wäre.
 */
export function checkVisitNote(
  visit: VisitNoteState,
  input: { note: string; hasIncident: boolean },
  now: Date,
): NoteRejection | null {
  if (!visit.gpsArrivalAt) return "not_started";

  const text = input.note.trim();
  if (input.hasIncident && text.length === 0) return "incident_without_note";
  if (text.length === 0) return "empty_note";

  // Erstschrift: keine Frist zu prüfen.
  if (visit.visitNote === null) return null;

  if (visit.gpsDepartureAt && now.getTime() - visit.gpsDepartureAt.getTime() > NOTE_EDIT_WINDOW_MS) {
    return "edit_window_expired";
  }

  return null;
}
