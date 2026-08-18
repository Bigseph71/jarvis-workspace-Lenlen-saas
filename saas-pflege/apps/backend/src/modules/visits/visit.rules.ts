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
