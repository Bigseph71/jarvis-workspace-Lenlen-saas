import {
  AbsenceStatus,
  AuditAction,
  GeocodingStatus,
  VisitStatus,
  withTenant,
  type Prisma,
} from "@len-len/database";
import { AppError } from "../../lib/errors.js";
import { writeAudit } from "../../lib/audit.js";
import { env } from "../../config/env.js";
import type { TenantContext } from "../../lib/context.js";
import { solveVrptw, type Stop } from "../../lib/vrptw/solver.js";
import { assessTour, type FeasibilityReport } from "../../lib/vrptw/feasibility.js";
import { pickVehicleForTrip } from "../vehicles/vehicle.rules.js";
import {
  assessStaffing,
  emptyStaffing,
  type StaffingReport,
  type TourAbsence,
} from "./tour.rules.js";

export interface OptimizeResult {
  routeId: string;
  order: string[];
  totalKm: number;
  score: number;
  partial: boolean;
  vehicleId: string | null;
  /** false, wenn kein Fahrzeug die Strecke im Leasing-Rahmen fahren kann. */
  sufficientCapacity: boolean;
  visitCount: number;
  /**
   * Geht die vorgeschlagene Reihenfolge zeitlich auf?
   *
   * Teil des Ergebnisses und nicht bloss ein Log-Eintrag: die Koordination
   * muss sehen, WO es klemmt, sonst bleibt ihr nur, dem Vorschlag zu glauben.
   */
  feasibility: FeasibilityReport;
  /**
   * Darf die eingeteilte Fachkraft diese Besuche fahren?
   *
   * Neben der Zeit die zweite Frage, und die haertere: eine Verspaetung ist
   * ein Aergernis, ein Einsatz an einem vertraglich freien Tag oder mit der
   * falschen Qualifikation ist ein Regelverstoss.
   */
  staffing: StaffingReport;
}

/**
 * Genehmigte Abwesenheiten, die in das Tagesfenster einer Tour ragen.
 *
 * Einen Tag Rand auf beiden Seiten: das Fenster steht in UTC, die Besuche
 * stehen in Ortszeit, und ein Termin um 23:00 deutscher Zeit liegt in UTC
 * schon am Folgetag. Der Rand kostet nichts -- welcher Besuch wirklich in
 * eine Abwesenheit fällt, entscheidet danach der Kalendertag-Vergleich in
 * tour.rules und nicht diese Abfrage.
 *
 * NUR genehmigte: über einen beantragten Urlaub hat noch niemand entschieden,
 * und eine Warnung darüber wäre ein Alarm über eine offene Entscheidung.
 * Dieselbe Auswahl trifft die Personalplanung (hr.service).
 */
function absencesWhere(
  caregiverIds: readonly string[],
  organizationId: string,
  window: { start: Date; end: Date },
): Prisma.AbsenceWhereInput {
  const from = new Date(window.start);
  from.setUTCDate(from.getUTCDate() - 1);
  const to = new Date(window.end);
  to.setUTCDate(to.getUTCDate() + 1);

  return {
    organizationId,
    caregiverId: { in: [...caregiverIds] },
    status: AbsenceStatus.APPROVED,
    startDate: { lt: to },
    endDate: { gte: from },
  };
}

const ABSENCE_SELECT = {
  caregiverId: true,
  type: true,
  startDate: true,
  endDate: true,
} satisfies Prisma.AbsenceSelect;

/** Tagesfenster [00:00, +24h) in UTC für ein @db.Date. */
function dayWindow(date: Date): { start: Date; end: Date } {
  const start = new Date(date);
  start.setUTCHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  return { start, end };
}

/**
 * Optimiert eine Tour (Route) per VRPTW-Solver und schreibt das Ergebnis zurück.
 *
 * Ablauf (kurze Transaktionen, Rechnung dazwischen ohne offene TX – wie beim
 * Geocoding):
 *   1) Route + zugehörige Besuche + aktive Fahrzeuge lesen.
 *   2) Regel 7: blockieren, sobald ein Patient nicht valide geokodiert ist.
 *   3) Solver mit Sicherheits-Deadline (VRPTW_TIMEOUT_MS) laufen lassen.
 *   4) Regel 6: Fahrzeug mit den wenigsten km für die Strecke wählen.
 *   5) Route (Reihenfolge, Score, km, Fahrzeug) + Besuchs-Verknüpfung schreiben.
 */
export async function optimizeRoute(ctx: TenantContext, routeId: string): Promise<OptimizeResult> {
  // 1) Lesen (kurze TX)
  const data = await withTenant(ctx.organizationId, async (tx) => {
    const route = await tx.route.findFirst({
      where: { id: routeId, organizationId: ctx.organizationId },
      select: {
        id: true,
        caregiverId: true,
        date: true,
        // Fuer die Besetzungspruefung: dieselbe Abfrage, keine zusaetzliche.
        caregiver: { select: { qualification: true, workDays: true } },
      },
    });
    if (!route) throw new AppError(404, "Tour nicht gefunden", "NotFound");

    const { start, end } = dayWindow(route.date);
    // Besuche der Tour: bereits verknüpfte ODER am Tourtag von der Fachkraft
    // durchzuführende (noch nicht verworfene) Besuche.
    const visits = await tx.visit.findMany({
      where: {
        organizationId: ctx.organizationId,
        status: { not: VisitStatus.CANCELED },
        OR: [
          { routeId: route.id },
          ...(route.caregiverId
            ? [{ caregiverId: route.caregiverId, scheduledAt: { gte: start, lt: end } }]
            : []),
        ],
      },
      select: {
        id: true,
        scheduledAt: true,
        durationMinutes: true,
        isEmergency: true,
        assignedCaregiverId: true,
        assignedCaregiver: { select: { qualification: true } },
        patient: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            careMinutes: true,
            latitude: true,
            longitude: true,
            geocodingStatus: true,
          },
        },
      },
      orderBy: { scheduledAt: "asc" },
    });

    const vehicles = await tx.vehicle.findMany({
      where: { organizationId: ctx.organizationId, isActive: true },
      select: { id: true, leasingKmUsed: true, leasingKmLimit: true, leasingEndDate: true },
    });

    const absences = route.caregiverId
      ? await tx.absence.findMany({
          where: absencesWhere([route.caregiverId], ctx.organizationId, { start, end }),
          select: ABSENCE_SELECT,
        })
      : [];

    return { route, visits, vehicles, absences };
  });

  const { route, visits, vehicles, absences } = data;

  // Leere Tour: nichts zu optimieren, aber als optimiert markieren (idempotent).
  if (visits.length === 0) {
    return persistResult(ctx, {
      routeId: route.id,
      order: [],
      totalKm: 0,
      score: 100,
      partial: false,
      vehicleId: null,
      sufficientCapacity: true,
      visitCount: 0,
      visitIds: [],
      // Eine leere Tour geht immer auf.
      feasibility: {
        feasible: true,
        violations: [],
        totalTravelMinutes: 0,
        totalCareMinutes: 0,
        uncheckedVisits: 0,
      },
      staffing: emptyStaffing(route.caregiver),
    });
  }

  // 2) Regel 7: Optimierung ist blockiert, solange ein Patient nicht valide
  // geokodiert ist (INVALID oder noch PENDING ohne Koordinaten).
  const blocking = visits.filter(
    (v) =>
      v.patient.geocodingStatus !== GeocodingStatus.VALID ||
      v.patient.latitude === null ||
      v.patient.longitude === null,
  );
  if (blocking.length > 0) {
    throw new AppError(
      409,
      `Optimierung blockiert: ${blocking.length} Patient(en) ohne gültige Geokodierung.`,
      "GeocodingIncomplete",
    );
  }

  // 3) Solver (ohne offene TX). Deadline = jetzt + konfiguriertes Timeout.
  const stops: Stop[] = visits.map((v) => ({
    visitId: v.id,
    lat: Number(v.patient.latitude),
    lng: Number(v.patient.longitude),
  }));
  const solution = solveVrptw(stops, { deadline: Date.now() + env.VRPTW_TIMEOUT_MS });

  /*
   * 3b) IST die vorgeschlagene Reihenfolge fahrbar?
   *
   * Der Solver ordnet nach Nähe und ist damit fertig; ob die Fachkraft es
   * schafft, fragte bisher niemand. Hier wird nachgerechnet, was zwischen zwei
   * Klingelknöpfen wirklich vergeht: die Pflegezeit beim Patienten und die
   * Fahrt danach.
   *
   * Die Prüfung ÄNDERT die Reihenfolge nicht. Sie meldet, wo sie nicht aufgeht
   * -- und das ist der Unterschied zwischen einem Plan, dem man ansieht warum
   * er so aussieht, und einer Blackbox. Die Koordination entscheidet, nicht
   * der Rechner: einen Termin zu verschieben heisst, bei einem Patienten
   * anzurufen.
   */
  // Dieselbe Bewertung wie beim LESEN einer Tour (getRoute). Zwei Wege durch
  // dieselbe Rechnung liefen unweigerlich auseinander -- und die Koordination
  // sähe nach dem Neuladen andere Zahlen als direkt nach der Optimierung.
  const feasibility = assessTour(visits, solution.order);

  /*
   * 3c) DARF sie die Tour fahren?
   *
   * Unabhaengig von der Reihenfolge: die Besetzungsregeln haengen an der
   * Person und am Kalender, nicht am Weg. Der Optimierer kann eine Tour nicht
   * regelkonform machen, indem er sie umsortiert -- und genau deshalb muss die
   * Meldung neben dem Vorschlag stehen und nicht an seiner Stelle.
   */
  const staffing = assessStaffing(route.caregiver, visits, absences);

  // 4) Regel 6: Fahrzeug mit den wenigsten genutzten km für die Strecke.
  const pick = pickVehicleForTrip(vehicles, solution.totalKm);

  // 5) Schreiben (kurze TX) + Audit
  return persistResult(ctx, {
    routeId: route.id,
    order: solution.order,
    totalKm: solution.totalKm,
    score: solution.score,
    partial: solution.partial,
    vehicleId: pick?.vehicle.id ?? null,
    sufficientCapacity: pick?.sufficientCapacity ?? false,
    visitCount: visits.length,
    visitIds: visits.map((v) => v.id),
    feasibility,
    staffing,
  });
}

export interface RouteStatus {
  id: string;
  caregiverId: string | null;
  vehicleId: string | null;
  date: string;
  visitsOrder: string[];
  optimized: boolean;
  vrptwScore: number | null;
  totalKm: number | null;
  /**
   * Geht die Tour in ihrer aktuellen Reihenfolge zeitlich auf?
   *
   * Bei jedem Lesen neu gerechnet, nie gespeichert -- ein abgelegtes Urteil
   * wäre nach der ersten Terminverschiebung falsch, und eine veraltete Zusage
   * "geht auf" sieht aus wie eine frische.
   */
  feasibility: FeasibilityReport;
  /**
   * Darf die eingeteilte Fachkraft diese Besuche fahren?
   *
   * Wie die Machbarkeit bei jedem Lesen neu gerechnet, und aus demselben
   * Grund: ein Vertrag aendert sich, eine Stamm-Fachkraft wechselt, und die
   * Tour von gestern bliebe sonst mit dem Urteil von gestern stehen.
   */
  staffing: StaffingReport;
}

/** Aktueller Zustand einer Tour (für Status-Polling durch das Frontend). */
export async function getRoute(ctx: TenantContext, routeId: string): Promise<RouteStatus> {
  return withTenant(ctx.organizationId, async (tx) => {
    const route = await tx.route.findFirst({
      where: { id: routeId, organizationId: ctx.organizationId },
      select: {
        id: true,
        caregiverId: true,
        vehicleId: true,
        date: true,
        visitsOrder: true,
        optimized: true,
        vrptwScore: true,
        totalKm: true,
        caregiver: { select: { qualification: true, workDays: true } },
      },
    });
    if (!route) throw new AppError(404, "Tour nicht gefunden", "NotFound");

    const order = Array.isArray(route.visitsOrder) ? (route.visitsOrder as string[]) : [];

    /*
     * Die Machbarkeit wird BEI JEDEM LESEN neu gerechnet und nirgends abgelegt.
     *
     * Eine gespeicherte Bewertung wäre in dem Moment falsch, in dem ein Termin
     * verschoben oder ein Besuch abgesagt wird -- also ständig. Sie müsste bei
     * jeder dieser Änderungen ungültig gemacht werden, und die vergessene
     * Stelle fiele niemandem auf: eine veraltete Zusage "geht auf" sieht
     * genauso aus wie eine frische.
     *
     * Die Rechnung ist reine Arithmetik über die Besuche des Tages, die hier
     * ohnehin geladen werden. Sie kostet keine zusätzliche Abfrage.
     */
    const visits = await tx.visit.findMany({
      where: tourVisitsWhere(route, ctx.organizationId),
      select: TOUR_VISIT_SELECT,
      orderBy: { scheduledAt: "asc" },
    });

    // Die einzige Angabe, die NICHT aus den ohnehin geladenen Besuchen fällt:
    // eine Abwesenheit hängt an der Fachkraft und am Kalender, nicht am
    // Besuch. Eine Abfrage je Tour, nicht je Besuch.
    const absences = route.caregiverId
      ? await tx.absence.findMany({
          where: absencesWhere([route.caregiverId], ctx.organizationId, dayWindow(route.date)),
          select: ABSENCE_SELECT,
        })
      : [];

    return {
      id: route.id,
      caregiverId: route.caregiverId,
      vehicleId: route.vehicleId,
      date: route.date.toISOString().slice(0, 10),
      visitsOrder: order,
      optimized: route.optimized,
      vrptwScore: route.vrptwScore === null ? null : Number(route.vrptwScore),
      totalKm: route.totalKm === null ? null : Number(route.totalKm),
      feasibility: assessTour(visits, order.length > 0 ? order : null),
      staffing: assessStaffing(route.caregiver, visits, absences),
    };
  });
}

/** Schreibt das Optimierungsergebnis in Route + verknüpft die Besuche. */
async function persistResult(
  ctx: TenantContext,
  r: OptimizeResult & { visitIds: string[] },
): Promise<OptimizeResult> {
  await withTenant(ctx.organizationId, async (tx) => {
    await tx.route.update({
      where: { id: r.routeId },
      data: {
        visitsOrder: r.order,
        optimized: true,
        vrptwScore: r.score,
        totalKm: r.totalKm,
        vehicleId: r.vehicleId,
      },
    });

    if (r.visitIds.length > 0) {
      await tx.visit.updateMany({
        where: { id: { in: r.visitIds }, organizationId: ctx.organizationId },
        data: { routeId: r.routeId },
      });
    }

    await writeAudit(tx, ctx, {
      action: AuditAction.UPDATE,
      entityType: "route",
      entityId: r.routeId,
      metadata: {
        event: "vrptw_optimize",
        totalKm: r.totalKm,
        score: r.score,
        partial: r.partial,
        vehicleId: r.vehicleId,
        sufficientCapacity: r.sufficientCapacity,
        visitCount: r.visitCount,
      },
    });
  });

  const { visitIds: _drop, ...result } = r;
  return result;
}

/**
 * Felder, die eine Tour-Bewertung braucht. Einmal beschrieben, damit Lesen und
 * Optimieren dieselben Spalten holen.
 */
const TOUR_VISIT_SELECT = {
  id: true,
  scheduledAt: true,
  durationMinutes: true,
  // Fuer die Besetzungspruefung (tour.rules): die Notfall-Ausnahme und die
  // Qualifikation der Stamm-Fachkraft, gegen die verglichen wird.
  isEmergency: true,
  assignedCaregiverId: true,
  assignedCaregiver: { select: { qualification: true } },
  patient: {
    select: { firstName: true, lastName: true, careMinutes: true, latitude: true, longitude: true },
  },
} satisfies Prisma.VisitSelect;

/**
 * Besuche, die zu einer Tour gehören.
 *
 * Dieselbe Bedingung wie beim Optimieren: bereits verknüpfte Besuche ODER die
 * am Tourtag von dieser Fachkraft zu fahrenden. Der zweite Teil ist nötig,
 * solange die Tour noch nie optimiert wurde -- vorher trägt kein Besuch eine
 * routeId, und eine Tour ohne Besuche ginge immer auf.
 */
function tourVisitsWhere(route: {
  id: string;
  caregiverId: string | null;
  date: Date;
}, organizationId: string): Prisma.VisitWhereInput {
  const { start, end } = dayWindow(route.date);
  return {
    organizationId,
    status: { not: VisitStatus.CANCELED },
    OR: [
      { routeId: route.id },
      ...(route.caregiverId
        ? [{ caregiverId: route.caregiverId, scheduledAt: { gte: start, lt: end } }]
        : []),
    ],
  };
}

// ── Tagesliste der Touren (Übersicht) ──────────────────────────────────────

export interface RouteRow {
  id: string;
  date: string;
  caregiver: { id: string; firstName: string; lastName: string } | null;
  vehicleId: string | null;
  optimized: boolean;
  vrptwScore: number | null;
  totalKm: number | null;
  visitCount: number;
  /**
   * Geht die Tour zeitlich auf? Nur die Zahl, nicht die Liste der Verstösse --
   * die Übersicht zeigt eine Zeile je Tour, die Einzelheiten stehen in
   * GET /routes/:id.
   */
  feasible: boolean;
  violationCount: number;
  uncheckedVisits: number;
  /**
   * Besuche, die diese Fachkraft nicht fahren duerfte -- freier Tag oder
   * falsche Qualifikation. Die Gruende stehen in GET /routes/:id.
   */
  staffingIssueCount: number;
}

export interface RouteDay {
  date: string;
  /**
   * Kennzahlen über den GANZEN Tag, nicht über die gerade gelieferte Seite.
   *
   * Der Grund ist die Übersicht: sie zeigt eine Tageskilometer-Zahl. Würde sie
   * über die erste Seite summieren, stünde dort eine Zahl, die mit der
   * Seitengrösse wächst – und niemand sähe es ihr an.
   */
  totals: { routes: number; optimized: number; totalKm: number };
  data: RouteRow[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

/**
 * Touren eines Tages.
 *
 * Bis hierher gab es nur `GET /routes/:id`: wer eine Tour sehen wollte, musste
 * ihre Kennung schon kennen. Eine Tagesübersicht war damit unmöglich, und
 * genau deshalb zeigte der Startbildschirm erfundene Touren.
 *
 * `date` ist ein `@db.Date`, also ein Kalendertag ohne Uhrzeit; verglichen wird
 * deshalb mit `dayWindow` (UTC-Mitternacht) und nicht mit `dayRange`, das für
 * Zeitstempel gedacht ist. Die beiden zu verwechseln verschiebt das Ergebnis
 * um einen Tag, sobald Deutschland in der Sommerzeit steht.
 */
export async function listRoutesForDay(
  ctx: TenantContext,
  { date, page, pageSize }: { date: Date; page: number; pageSize: number },
): Promise<RouteDay> {
  return withTenant(ctx.organizationId, async (tx) => {
    const { start, end } = dayWindow(date);
    const where = { organizationId: ctx.organizationId, date: { gte: start, lt: end } };

    const [rows, total, aggregate, optimized] = await Promise.all([
      tx.route.findMany({
        where,
        // Nach Fachkraft sortiert und nicht nach Anlage: die Liste wird
        // gelesen, um eine bestimmte Tour zu finden.
        orderBy: [{ caregiver: { lastName: "asc" } }, { id: "asc" }],
        select: {
          id: true,
          date: true,
          caregiverId: true,
          vehicleId: true,
          optimized: true,
          vrptwScore: true,
          totalKm: true,
          visitsOrder: true,
          caregiver: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              qualification: true,
              workDays: true,
            },
          },
          _count: { select: { visits: true } },
        },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      tx.route.count({ where }),
      tx.route.aggregate({ where, _sum: { totalKm: true } }),
      tx.route.count({ where: { ...where, optimized: true } }),
    ]);

    /*
     * EINE Abfrage für alle Touren der Seite, nicht eine je Tour.
     *
     * Die Übersicht zeigt bis zu 500 Touren; je Tour nachzuladen hiesse 500
     * Rundläufe für eine Zahl. Stattdessen kommen die Besuche des Tages
     * gesammelt und werden hier zugeordnet -- nach derselben Regel wie beim
     * Optimieren: verknüpfte Besuche ODER die dieser Fachkraft an diesem Tag.
     */
    const caregiverIds = rows.map((row) => row.caregiverId).filter((id): id is string => id !== null);
    const routeIds = rows.map((row) => row.id);
    const dayVisits =
      routeIds.length === 0
        ? []
        : await tx.visit.findMany({
            where: {
              organizationId: ctx.organizationId,
              status: { not: VisitStatus.CANCELED },
              OR: [
                { routeId: { in: routeIds } },
                ...(caregiverIds.length > 0
                  ? [{ caregiverId: { in: caregiverIds }, scheduledAt: { gte: start, lt: end } }]
                  : []),
              ],
            },
            select: { ...TOUR_VISIT_SELECT, routeId: true, caregiverId: true },
            orderBy: { scheduledAt: "asc" },
          });

    /*
     * EINE Abfrage für die Abwesenheiten der ganzen Seite, nach demselben
     * Muster wie die Besuche darüber: bis zu 500 Touren, und eine Abfrage je
     * Tour hiesse 500 Rundläufe für die Frage, wer heute überhaupt da ist.
     */
    const dayAbsences =
      caregiverIds.length === 0
        ? []
        : await tx.absence.findMany({
            where: absencesWhere(caregiverIds, ctx.organizationId, { start, end }),
            select: ABSENCE_SELECT,
          });

    const reportFor = (row: (typeof rows)[number]) => {
      const own = dayVisits.filter(
        (visit) =>
          visit.routeId === row.id ||
          (row.caregiverId !== null && visit.routeId === null && visit.caregiverId === row.caregiverId),
      );
      const order = Array.isArray(row.visitsOrder) ? (row.visitsOrder as string[]) : [];
      const absences: TourAbsence[] = dayAbsences.filter(
        (absence) => absence.caregiverId === row.caregiverId,
      );
      return {
        feasibility: assessTour(own, order.length > 0 ? order : null),
        staffing: assessStaffing(row.caregiver, own, absences),
      };
    };

    return {
      date: start.toISOString().slice(0, 10),
      totals: {
        routes: total,
        optimized,
        // Auf 100 Meter gerundet. Als Zahl und nicht als Zeichenkette, wie
        // schon bei getRoute: eine Kennzahl wird gerechnet, nicht gespeichert.
        totalKm: Math.round(Number(aggregate._sum.totalKm ?? 0) * 10) / 10,
      },
      data: rows.map((row) => {
        const report = reportFor(row);
        return {
          id: row.id,
          date: row.date.toISOString().slice(0, 10),
          // Ausdruecklich aufgezaehlt: die Abfrage holt fuer die Pruefung mehr
          // Spalten (Qualifikation, Arbeitstage), und die haben in einer
          // Tagesliste nichts verloren.
          caregiver: row.caregiver
            ? {
                id: row.caregiver.id,
                firstName: row.caregiver.firstName,
                lastName: row.caregiver.lastName,
              }
            : null,
          vehicleId: row.vehicleId,
          optimized: row.optimized,
          vrptwScore: row.vrptwScore === null ? null : Number(row.vrptwScore),
          totalKm: row.totalKm === null ? null : Number(row.totalKm),
          visitCount: row._count.visits,
          feasible: report.feasibility.feasible,
          violationCount: report.feasibility.violations.length,
          uncheckedVisits: report.feasibility.uncheckedVisits,
          staffingIssueCount: report.staffing.issues.length,
        };
      }),
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    };
  });
}
