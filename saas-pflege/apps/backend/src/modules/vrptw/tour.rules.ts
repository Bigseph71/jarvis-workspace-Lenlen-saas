import type { Prisma, Qualification } from "@len-len/database";
import { weekdayCode, type WeekDay } from "../../lib/week.js";
import { enforcesStammRules, isWorkDay, sameQualification } from "../visits/visit.rules.js";

/**
 * Darf diese Fachkraft diese Tour überhaupt fahren?
 *
 * Die zeitliche Prüfung (lib/vrptw/feasibility) beantwortet, ob die Tour zu
 * SCHAFFEN ist. Sie sagt nichts darüber, ob die eingeteilte Person sie fahren
 * DARF -- und das sind zwei verschiedene Fragen mit zwei verschiedenen
 * Konsequenzen: die eine kostet Verspätung, die andere ist ein Verstoss gegen
 * Regel 4 (Vertretung nur bei gleicher Qualifikation) und Regel 5 (nur an
 * Arbeitstagen laut Vertrag).
 *
 * Beide Regeln gab es schon -- aber nur beim Zuweisen EINES Besuchs
 * (visit.service). Eine Tour entsteht anders: der Optimierer ordnet Besuche,
 * die längst zugewiesen sind. Ändert sich danach der Vertrag einer Fachkraft
 * oder die Stamm-Fachkraft eines Patienten, bleibt die Tour unauffällig
 * bestehen -- geprüft wurde sie ja, damals.
 *
 * Deshalb werden hier DIESELBEN Funktionen aufgerufen und nicht neu
 * geschrieben. Zwei Fassungen derselben Regel laufen auseinander, und die
 * Koordination erführe je nach Bildschirm etwas anderes.
 */

/** Warum ein Besuch dieser Fachkraft nicht zusteht. */
export type StaffingReason = "off_day" | "qualification";

export interface StaffingIssue {
  visitId: string;
  patientName: string;
  reason: StaffingReason;
  /** Wochentag des Besuchs. Nur bei "off_day". */
  weekday?: WeekDay;
  /** Qualifikation der fahrenden Fachkraft. Nur bei "qualification". */
  actualQualification?: Qualification;
  /** Qualifikation der Stamm-Fachkraft. Nur bei "qualification". */
  requiredQualification?: Qualification;
}

export interface StaffingReport {
  /**
   * Konnte geprüft werden?
   *
   * `false` heisst: der Tour ist keine Fachkraft zugeteilt. Dann gibt es
   * niemanden, gegen den sich prüfen liesse -- und die Übersicht sagt das
   * bereits in derselben Zeile ("Keine Fachkraft zugewiesen"). Eine leere
   * Liste wäre hier zwar auch richtig, aber sie liesse sich nicht von
   * "geprüft, nichts gefunden" unterscheiden.
   */
  checked: boolean;
  issues: StaffingIssue[];
}

/** Die Fachkraft, die die Tour fährt. */
export interface TourCaregiver {
  qualification: Qualification;
  workDays: Prisma.JsonValue;
}

/** Was von einem Besuch für die Besetzungsprüfung gebraucht wird. */
export interface VisitForStaffing {
  id: string;
  scheduledAt: Date;
  isEmergency: boolean;
  assignedCaregiverId: string | null;
  assignedCaregiver: { qualification: Qualification } | null;
  patient: { firstName: string; lastName: string } | null;
}

function nameOf(visit: VisitForStaffing): string {
  return `${visit.patient?.firstName ?? ""} ${visit.patient?.lastName ?? ""}`.trim();
}

/**
 * Prüft eine ganze Tour gegen die Fachkraft, die sie fährt.
 *
 * HÖCHSTENS EIN Befund je Besuch, und "off_day" schlägt "qualification":
 * arbeitet die Fachkraft an diesem Tag gar nicht, ist die Frage nach ihrer
 * Qualifikation gegenstandslos. Zwei Meldungen zu demselben Besuch liessen
 * die Tour doppelt so kaputt aussehen, wie sie ist -- und die Zahl in der
 * Übersicht soll "so viele Besuche muss ich anfassen" heissen.
 *
 * Notfälle bleiben aussen vor (enforcesStammRules): sie entstehen ausserhalb
 * des Zyklus und dürfen laut Regel 2 von jeder aktiven Fachkraft gefahren
 * werden. Ein Besuch ohne Stamm-Fachkraft hat nichts, womit sich vergleichen
 * liesse -- die Arbeitstag-Regel gilt für ihn trotzdem, denn sie hängt an der
 * Fahrerin und nicht am Patienten.
 */
export function assessStaffing(
  caregiver: TourCaregiver | null,
  visits: readonly VisitForStaffing[],
): StaffingReport {
  if (!caregiver) return { checked: false, issues: [] };

  const issues: StaffingIssue[] = [];

  for (const visit of visits) {
    if (!visit.isEmergency && !isWorkDay(caregiver, visit.scheduledAt)) {
      issues.push({
        visitId: visit.id,
        patientName: nameOf(visit),
        reason: "off_day",
        weekday: weekdayCode(visit.scheduledAt),
      });
      continue;
    }

    if (!enforcesStammRules(visit)) continue;

    const required = visit.assignedCaregiver?.qualification;
    if (!required || sameQualification(caregiver.qualification, required)) continue;

    issues.push({
      visitId: visit.id,
      patientName: nameOf(visit),
      reason: "qualification",
      actualQualification: caregiver.qualification,
      requiredQualification: required,
    });
  }

  return { checked: true, issues };
}

/** Eine Tour ohne Besuche: nichts zu beanstanden, aber geprüft. */
export function emptyStaffing(caregiver: TourCaregiver | null): StaffingReport {
  return { checked: caregiver !== null, issues: [] };
}
