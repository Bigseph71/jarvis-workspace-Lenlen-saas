import type { AbsenceType, Prisma, Qualification } from "@len-len/database";
import { isoDay, weekdayCode, type WeekDay } from "../../lib/week.js";
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
 * Dieselbe Lücke, dritter Fall: die ABWESENHEIT. Eine genehmigte Krankmeldung
 * oder ein Urlaub nimmt der Fachkraft den Tag, aber keine ihrer Touren. Der
 * Zusammenhang existierte im System bisher nur in der Personalplanung
 * (hr.service, Wochenbilanz) -- in der Tagesdisposition nicht, und dort wird
 * er gebraucht: eine Tour, die niemand fährt, sieht genauso aus wie eine
 * gefahrene, bis der erste Patient anruft.
 *
 * Deshalb werden hier DIESELBEN Funktionen aufgerufen und nicht neu
 * geschrieben. Zwei Fassungen derselben Regel laufen auseinander, und die
 * Koordination erführe je nach Bildschirm etwas anderes.
 */

/** Warum ein Besuch dieser Fachkraft nicht zusteht. */
export type StaffingReason = "absence" | "off_day" | "qualification";

export interface StaffingIssue {
  visitId: string;
  patientName: string;
  reason: StaffingReason;
  /** Art der Abwesenheit (Krankheit, Urlaub …). Nur bei "absence". */
  absenceType?: AbsenceType;
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

/**
 * Eine genehmigte Abwesenheit dieser Fachkraft.
 *
 * NUR genehmigte: ein beantragter Urlaub ist noch keine Abwesenheit, und die
 * Tour eines Menschen zu beanstanden, über dessen Antrag niemand entschieden
 * hat, wäre ein Alarm über eine Entscheidung, die noch aussteht. Ausgewählt
 * wird das in der Abfrage (AbsenceStatus.APPROVED), wie es die
 * Personalplanung schon tut.
 *
 * `startDate` und `endDate` sind `@db.Date`: KALENDERTAGE, einschliesslich
 * beider Enden.
 */
export interface TourAbsence {
  type: AbsenceType;
  startDate: Date;
  endDate: Date;
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
 * Fällt der Besuch in diese Abwesenheit?
 *
 * Verglichen werden KALENDERTAGE, nicht Zeitpunkte: die Abwesenheit steht als
 * Datum in der Datenbank, der Besuch als Zeitstempel. Ein Besuch um 22:00
 * deutscher Zeit liegt in UTC schon am Folgetag -- direkt verglichen fiele er
 * aus dem letzten Urlaubstag heraus, und zwar nur abends.
 *
 * Beide Enden zählen mit: wer bis Freitag krankgeschrieben ist, ist am Freitag
 * krank.
 */
function covers(absence: TourAbsence, visitDay: string): boolean {
  return isoDay(absence.startDate) <= visitDay && visitDay <= isoDay(absence.endDate);
}

/**
 * Prüft eine ganze Tour gegen die Fachkraft, die sie fährt.
 *
 * HÖCHSTENS EIN Befund je Besuch, in dieser Reihenfolge: Abwesenheit, freier
 * Tag, Qualifikation. Jede schlägt die folgende, weil sie die folgende
 * gegenstandslos macht -- wer krankgeschrieben ist, arbeitet auch nicht an
 * seinem Arbeitstag, und über die Qualifikation einer Abwesenden zu streiten
 * hilft niemandem. Zwei Meldungen zu demselben Besuch liessen die Tour
 * doppelt so kaputt aussehen, wie sie ist -- und die Zahl in der Übersicht
 * soll "so viele Besuche muss ich anfassen" heissen.
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
  absences: readonly TourAbsence[],
): StaffingReport {
  if (!caregiver) return { checked: false, issues: [] };

  const issues: StaffingIssue[] = [];

  for (const visit of visits) {
    /*
     * Die Abwesenheit gilt auch für den NOTFALL, und das ist der Unterschied
     * zu den beiden anderen Regeln.
     *
     * Regel 2 erlaubt einem Notfall jede aktive Fachkraft -- aber eine
     * krankgeschriebene Fachkraft ist nicht "aktiv, aber unpassend
     * eingeteilt", sie ist NICHT DA. Eine Ausnahme, die den Notfall an sie
     * vergibt, gibt ihn an niemanden.
     */
    const absence = absences.find((entry) => covers(entry, isoDay(visit.scheduledAt)));
    if (absence) {
      issues.push({
        visitId: visit.id,
        patientName: nameOf(visit),
        reason: "absence",
        absenceType: absence.type,
      });
      continue;
    }

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
