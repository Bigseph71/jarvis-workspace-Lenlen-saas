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
