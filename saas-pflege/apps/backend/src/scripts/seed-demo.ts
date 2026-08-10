/**
 * Jeu de démonstration – chargement.
 *
 * Crée (ou remet à niveau) une organisation complète et crédible : 15 patients,
 * 5 fachkräfte, 3 véhicules, deux semaines de tournées, des absences, des
 * remplacements. Les données elles-mêmes sont dans demo/demo-data.ts.
 *
 * ── Pourquoi un script plutôt qu'une saisie à la main ────────────────────
 * Une démonstration se rejoue. Les données doivent donc se recharger à
 * l'identique la veille d'un rendez-vous, sans doublon et sans dérive : les
 * identifiants sont DÉRIVÉS des slugs (UUID v5), pas tirés au hasard. Relancer
 * le script met à jour les mêmes lignes au lieu d'en créer de nouvelles.
 *
 * ── Ce que le script garantit ────────────────────────────────────────────
 * Il ne se contente pas d'écrire : il RELIT ensuite la base et vérifie que les
 * données respectent les règles métier (une visite par semaine et par patient,
 * remplacement à qualification égale, visite sur un jour travaillé). Des
 * données de démonstration qui violeraient les règles que le produit est censé
 * faire respecter seraient pires que pas de données du tout – on les
 * montrerait à un prospect en affirmant le contraire.
 *
 * ── Usage (depuis apps/backend) ──────────────────────────────────────────
 *
 *   pnpm seed:demo                          # dry-run : montre, n'écrit rien
 *   pnpm seed:demo -- --apply               # applique
 *   pnpm seed:demo -- --apply --week=2026-09-07
 *   pnpm seed:demo -- --apply --now=2026-08-12T10:00:00+02:00
 *   pnpm seed:demo -- --apply --password='...'
 *   pnpm seed:demo -- --apply --reset       # efface l'organisation de démo, puis recharge
 *
 * --now décale l'instant de référence qui décide quelles visites sont déjà
 * terminées, laquelle est en cours, lesquelles restent à venir. Utile pour
 * préparer le soir une démonstration qui aura lieu le lendemain matin.
 *
 * Le dry-run est réel : tout est exécuté dans une transaction, puis annulé.
 * Ce qu'il affiche est donc ce qui se passerait, pas une estimation.
 */

import "dotenv/config";
import { createHash } from "node:crypto";
import {
  AuditAction,
  ExternalSource,
  GeocodingStatus,
  Locale,
  Qualification,
  SubscriptionPlan,
  SubscriptionStatus,
  UserRole,
  VisitStatus,
  prisma,
} from "@len-len/database";
import { hashPassword } from "../lib/password.js";
import { writeAudit } from "../lib/audit.js";
import { APP_TIME_ZONE, startOfISOWeek, weekdayCode, type WeekDay } from "../lib/week.js";
import { isWorkDay, sameQualification } from "../modules/visits/visit.rules.js";
import { GPS_POLICY_VERSION } from "../modules/consent/consent.policy.js";
import type { TenantContext, TenantTx } from "../lib/context.js";
import {
  ABSENCES,
  CAREGIVERS,
  EMERGENCY,
  HOME_BASE,
  PATIENTS,
  REPLACEMENTS,
  STAFF_USERS,
  UNPLANNED_THIS_WEEK,
  VEHICLES,
  type DemoCaregiver,
  type DemoPatient,
} from "./demo/demo-data.js";

// ── Identité de l'organisation de démonstration ───────────────────────────

const DEMO_ORG_NAME = "Demo Pflegedienst Heidelberg";
const DEFAULT_PASSWORD = "DemoPflege2026!";

/**
 * UUID v5 dérivé d'un slug : le même slug donne toujours le même identifiant.
 * C'est ce qui rend le script rejouable – sans cela, chaque exécution créerait
 * un second jeu de données à côté du premier.
 */
function demoId(slug: string): string {
  const digest = createHash("sha1").update(`len-len:demo:${slug}`).digest();
  const bytes = Buffer.from(digest.subarray(0, 16));
  bytes[6] = (bytes[6]! & 0x0f) | 0x50; // version 5
  bytes[8] = (bytes[8]! & 0x3f) | 0x80; // variante RFC 4122
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

const ORG_ID = demoId("organization");

/**
 * Aléa DÉTERMINISTE. Les pointages ont besoin de petites variations (personne
 * n'arrive à la seconde près), mais Math.random ferait bouger toutes les
 * données à chaque exécution et le script ne serait plus rejouable.
 */
function jitter(seed: string, spread: number): number {
  const digest = createHash("sha1").update(seed).digest();
  const unit = digest.readUInt32BE(0) / 0xffffffff; // 0..1
  return (unit * 2 - 1) * spread;
}

// ── Options ───────────────────────────────────────────────────────────────

interface Options {
  apply: boolean;
  reset: boolean;
  weekOf: Date;
  now: Date;
  password: string;
}

function parseArgs(argv: string[]): Options {
  const options: Options = {
    apply: false,
    reset: false,
    weekOf: new Date(),
    now: new Date(),
    password: DEFAULT_PASSWORD,
  };

  for (const arg of argv) {
    if (arg === "--apply") options.apply = true;
    else if (arg === "--reset") options.reset = true;
    else if (arg.startsWith("--week=")) {
      const raw = arg.slice("--week=".length);
      const parsed = new Date(`${raw}T12:00:00.000Z`);
      if (Number.isNaN(parsed.getTime())) throw new Error(`--week attend une date YYYY-MM-DD, reçu "${raw}"`);
      options.weekOf = parsed;
    } else if (arg.startsWith("--now=")) {
      const parsed = new Date(arg.slice("--now=".length));
      if (Number.isNaN(parsed.getTime())) throw new Error("--now attend un instant ISO 8601");
      options.now = parsed;
    } else if (arg.startsWith("--password=")) {
      options.password = arg.slice("--password=".length);
    } else if (arg.startsWith("--")) {
      throw new Error(`Option inconnue : ${arg}`);
    }
  }

  return options;
}

// ── Dates ─────────────────────────────────────────────────────────────────

const DAY_INDEX: Record<WeekDay, number> = { MON: 0, TUE: 1, WED: 2, THU: 3, FRI: 4, SAT: 5, SUN: 6 };
const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

/**
 * Instant correspondant à `dayOffset` jours et `minute` minutes après le lundi
 * 00:00 LOCAL de la semaine.
 *
 * L'addition d'heures fixes est sûre ici : le changement d'heure tombe un
 * dimanche, donc jamais entre le lundi et le vendredi d'une même semaine ISO.
 */
function slot(monday: Date, dayOffset: number, minute: number): Date {
  return new Date(monday.getTime() + dayOffset * DAY + minute * MINUTE);
}

/**
 * Jour calendaire LOCAL d'un instant, ramené à minuit UTC.
 *
 * Nécessaire pour les colonnes `@db.Date` : Prisma y sérialise les composantes
 * UTC. Le lundi 00:00 de Berlin est le dimanche 22:00 UTC – stocké tel quel, il
 * daterait la tournée de la veille.
 */
function calendarDayUtc(instant: Date): Date {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(instant);
  const get = (type: string): string => parts.find((p) => p.type === type)?.value ?? "01";
  return new Date(`${get("year")}-${get("month")}-${get("day")}T00:00:00.000Z`);
}

function isoDay(instant: Date): string {
  return calendarDayUtc(instant).toISOString().slice(0, 10);
}

// ── Distances ─────────────────────────────────────────────────────────────

interface Point {
  latitude: number;
  longitude: number;
}

/** Distance à vol d'oiseau, en km. */
function haversineKm(a: Point, b: Point): number {
  const R = 6371;
  const toRad = (deg: number): number => (deg * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * Facteur de détour routier. Le vol d'oiseau sous-estime systématiquement un
 * trajet réel ; 1.35 est l'ordre de grandeur usuel en ville. Les km affichés
 * restent une ESTIMATION – le VRPTW, lui, calculera des distances réelles.
 */
const ROAD_FACTOR = 1.35;

/**
 * Km d'une tournée : base → patients dans l'ordre → base.
 *
 * Renvoie `null` dès qu'un patient de la tournée n'est pas géolocalisé. Le
 * réflexe serait d'ignorer ces arrêts et de sommer le reste, mais le chiffre
 * obtenu serait faux sans le dire : une tournée dont l'unique patient n'a pas
 * de coordonnées afficherait 0 km. Une distance inconnue doit rester inconnue –
 * c'est aussi ce qui rend visible le coût d'un geocodage manquant (règle 7).
 */
function routeKm(stops: (Point | null)[]): number | null {
  if (stops.some((stop) => stop === null)) return null;
  const path = [HOME_BASE, ...(stops as Point[]), HOME_BASE];
  let km = 0;
  for (let i = 1; i < path.length; i += 1) km += haversineKm(path[i - 1]!, path[i]!);
  return Math.round(km * ROAD_FACTOR * 10) / 10;
}

// ── Structures de travail ─────────────────────────────────────────────────

interface PlannedVisit {
  id: string;
  patient: DemoPatient;
  /** Fachkraft attitrée. */
  assigned: DemoCaregiver;
  /** Fachkraft qui exécute (= attitrée, sauf remplacement). */
  effective: DemoCaregiver;
  scheduledAt: Date;
  status: VisitStatus;
  isEmergency: boolean;
  emergencyReason: string | null;
  replacementMotive: string | null;
}

const caregiverBySlug = new Map(CAREGIVERS.map((c) => [c.slug, c]));
const patientBySlug = new Map(PATIENTS.map((p) => [p.slug, p]));

function requireCaregiver(slug: string): DemoCaregiver {
  const caregiver = caregiverBySlug.get(slug);
  if (!caregiver) throw new Error(`Fachkraft inconnue dans le jeu de démonstration : ${slug}`);
  return caregiver;
}

function requirePatient(slug: string): DemoPatient {
  const patient = patientBySlug.get(slug);
  if (!patient) throw new Error(`Patient inconnu dans le jeu de démonstration : ${slug}`);
  return patient;
}

/** Durée d'une visite selon la qualification – une toilette n'est pas un soin. */
function visitDurationMinutes(qualification: Qualification): number {
  return qualification === Qualification.PFLEGEFACHKRAFT ? 40 : 30;
}

/**
 * Construit les visites d'une semaine.
 *
 * `weekOffset` : 0 = semaine courante, -1 = semaine passée. La semaine passée
 * sert d'historique : toutes les visites y sont honorées, sans absence ni
 * remplacement. Sans cet historique, le produit s'ouvrirait sur des rapports
 * vides et des compteurs à zéro, ce qui donne à une démonstration l'air d'une
 * maquette.
 */
function buildWeek(monday: Date, weekOffset: number, now: Date): PlannedVisit[] {
  const visits: PlannedVisit[] = [];
  const isCurrent = weekOffset === 0;
  const weekKey = isoDay(monday);

  const replacementByPatient = new Map(
    isCurrent ? REPLACEMENTS.map((r) => [r.patient, r] as const) : [],
  );

  for (const patient of PATIENTS) {
    if (isCurrent && UNPLANNED_THIS_WEEK.includes(patient.slug)) continue;

    const assigned = requireCaregiver(patient.assignedTo);
    const replacement = replacementByPatient.get(patient.slug);
    const effective = replacement ? requireCaregiver(replacement.performedBy) : assigned;

    const scheduledAt = slot(monday, DAY_INDEX[patient.visitDay], patient.visitMinute);

    visits.push({
      id: demoId(`visit:${patient.slug}:${weekKey}`),
      patient,
      assigned,
      effective,
      scheduledAt,
      status: deriveStatus(scheduledAt, effective, now, weekOffset),
      isEmergency: false,
      emergencyReason: null,
      replacementMotive: replacement?.motive ?? null,
    });
  }

  if (isCurrent) {
    const patient = requirePatient(EMERGENCY.patient);
    const effective = requireCaregiver(EMERGENCY.performedBy);
    const scheduledAt = slot(monday, EMERGENCY.dayOffset, EMERGENCY.minute);
    visits.push({
      id: demoId(`visit:emergency:${patient.slug}:${weekKey}`),
      patient,
      assigned: requireCaregiver(patient.assignedTo),
      effective,
      scheduledAt,
      status: deriveStatus(scheduledAt, effective, now, weekOffset),
      isEmergency: true,
      emergencyReason: EMERGENCY.reason,
      replacementMotive: null,
    });
  }

  return visits.sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime());
}

/**
 * Statut d'une visite par rapport à l'instant de référence.
 *
 * C'est ce qui donne à la démonstration l'air d'un système en marche : les
 * visites du matin sont closes, une est en cours, celles de l'après-midi
 * attendent. Une base entièrement PLANNED se voit immédiatement.
 */
function deriveStatus(
  scheduledAt: Date,
  effective: DemoCaregiver,
  now: Date,
  weekOffset: number,
): VisitStatus {
  if (weekOffset < 0) return VisitStatus.COMPLETED;
  const duration = visitDurationMinutes(effective.qualification) * MINUTE;
  if (scheduledAt.getTime() + duration <= now.getTime()) return VisitStatus.COMPLETED;
  if (scheduledAt.getTime() <= now.getTime()) return VisitStatus.IN_PROGRESS;
  return VisitStatus.PLANNED;
}

// ── Écriture ──────────────────────────────────────────────────────────────

/** Annule la transaction d'un dry-run tout en laissant remonter le compte-rendu. */
class DryRunRollback extends Error {
  constructor(public readonly report: Report) {
    super("dry-run");
    this.name = "DryRunRollback";
  }
}

interface Report {
  users: number;
  caregivers: number;
  patients: number;
  vehicles: number;
  contracts: number;
  workSchedules: number;
  absences: number;
  visits: number;
  completed: number;
  inProgress: number;
  planned: number;
  emergencies: number;
  replacements: number;
  routes: number;
  consents: number;
  positions: number;
  unplannedPatients: string[];
}

async function seed(options: Options, passwordHash: string): Promise<Report> {
  const monday = startOfISOWeek(options.weekOf);
  const previousMonday = new Date(monday.getTime() - 7 * DAY);

  const report: Report = {
    users: 0,
    caregivers: 0,
    patients: 0,
    vehicles: 0,
    contracts: 0,
    workSchedules: 0,
    absences: 0,
    visits: 0,
    completed: 0,
    inProgress: 0,
    planned: 0,
    emergencies: 0,
    replacements: 0,
    routes: 0,
    consents: 0,
    positions: 0,
    unplannedPatients: [],
  };

  const run = async (): Promise<Report> =>
    prisma.$transaction(
      async (tx) => {
        if (options.reset) await resetDemoOrg(tx);

        // ── Organisation ──────────────────────────────────────────────────
        // PRO/ACTIVE délibérément : en démonstration, un plafond de plan qui
        // renvoie 402 au milieu d'une saisie ne démontre rien d'utile.
        await tx.organization.upsert({
          where: { id: ORG_ID },
          update: {
            name: DEMO_ORG_NAME,
            subscriptionPlan: SubscriptionPlan.PRO,
            subscriptionStatus: SubscriptionStatus.ACTIVE,
            planLimits: { patients: 1000, caregivers: 100, vehicles: 30, ki: true },
            trialEndsAt: null,
            pastDueSince: null,
          },
          create: {
            id: ORG_ID,
            name: DEMO_ORG_NAME,
            country: "DE",
            subscriptionPlan: SubscriptionPlan.PRO,
            subscriptionStatus: SubscriptionStatus.ACTIVE,
            planLimits: { patients: 1000, caregivers: 100, vehicles: 30, ki: true },
          },
        });

        await tx.$executeRawUnsafe(`SELECT set_config('app.current_org', $1, true)`, ORG_ID);

        const ctx: TenantContext = { organizationId: ORG_ID, userId: demoId("user:koordinator") };

        // ── Comptes ───────────────────────────────────────────────────────
        for (const staff of STAFF_USERS) {
          await upsertUser(tx, demoId(`user:${staff.slug}`), staff.email, staff.role, passwordHash);
          report.users += 1;
        }
        for (const caregiver of CAREGIVERS) {
          await upsertUser(
            tx,
            demoId(`user:${caregiver.slug}`),
            caregiver.email,
            UserRole.FACHKRAFT,
            passwordHash,
          );
          report.users += 1;
        }

        // ── Fachkräfte + contrat en vigueur ───────────────────────────────
        for (const caregiver of CAREGIVERS) {
          const id = demoId(`caregiver:${caregiver.slug}`);
          const snapshot = {
            firstName: caregiver.firstName,
            lastName: caregiver.lastName,
            qualification: caregiver.qualification,
            contractType: caregiver.contractType,
            weeklyHours: caregiver.weeklyHours,
            workDays: [...caregiver.workDays],
            maxPatients: caregiver.maxPatients,
            isActive: true,
            userId: demoId(`user:${caregiver.slug}`),
          };
          await tx.caregiver.upsert({
            where: { id },
            update: snapshot,
            create: { id, organizationId: ORG_ID, ...snapshot },
          });
          report.caregivers += 1;

          // La table `contracts` est la source de vérité ; les champs ci-dessus
          // n'en sont qu'une copie de lecture rapide. Sans cette ligne, la
          // fachkraft n'aurait pas d'historique contractuel et le module
          // Vertrag daterait son premier contrat du jour du chargement.
          const contractId = demoId(`contract:${caregiver.slug}`);
          const contract = {
            caregiverId: id,
            contractType: caregiver.contractType,
            weeklyHours: caregiver.weeklyHours,
            workDays: [...caregiver.workDays],
            maxPatients: caregiver.maxPatients,
            validFrom: new Date(`${caregiver.hiredOn}T00:00:00.000Z`),
            validUntil: null,
            externalSource: ExternalSource.MANUAL,
          };
          await tx.contract.upsert({
            where: { id: contractId },
            update: contract,
            create: { id: contractId, organizationId: ORG_ID, ...contract },
          });
          report.contracts += 1;
        }

        // ── Véhicules ─────────────────────────────────────────────────────
        for (const vehicle of VEHICLES) {
          const id = demoId(`vehicle:${vehicle.slug}`);
          const data = {
            label: vehicle.label,
            leasingKmLimit: vehicle.leasingKmLimit,
            leasingKmUsed: vehicle.leasingKmUsed,
            leasingEndDate: new Date(`${vehicle.leasingEndDate}T00:00:00.000Z`),
            isActive: true,
          };
          await tx.vehicle.upsert({
            where: { id },
            update: data,
            create: { id, organizationId: ORG_ID, ...data },
          });
          report.vehicles += 1;
        }

        // ── Patients ──────────────────────────────────────────────────────
        for (const patient of PATIENTS) {
          const id = demoId(`patient:${patient.slug}`);
          const geocoded = patient.geocodingStatus === GeocodingStatus.VALID;
          const data = {
            assignedCaregiverId: demoId(`caregiver:${patient.assignedTo}`),
            firstName: patient.firstName,
            lastName: patient.lastName,
            rawAddress: patient.address,
            normalizedAddress: geocoded ? patient.address : null,
            latitude: patient.latitude,
            longitude: patient.longitude,
            // 0.80 = centroïde de voie, pas un toit. Voir demo-data.ts.
            geocodingScore: geocoded ? 0.8 : null,
            geocodingStatus: patient.geocodingStatus,
            isActive: true,
          };
          const existing = await tx.patient.findUnique({ where: { id }, select: { id: true } });
          await tx.patient.upsert({
            where: { id },
            update: data,
            create: { id, organizationId: ORG_ID, ...data },
          });
          report.patients += 1;

          // Trace d'audit à la création seulement : rejouer le script ne doit
          // pas gonfler le journal d'accès aux données patients.
          if (!existing) {
            await writeAudit(tx, ctx, {
              action: AuditAction.CREATE,
              entityType: "patient",
              entityId: id,
              metadata: { source: "seed-demo" },
            });
          }
        }

        // ── Absences ──────────────────────────────────────────────────────
        for (const absence of ABSENCES) {
          const base = new Date(monday.getTime() + absence.weekOffset * 7 * DAY);
          const id = demoId(`absence:${absence.slug}:${isoDay(base)}`);
          const data = {
            caregiverId: demoId(`caregiver:${absence.caregiver}`),
            type: absence.type,
            status: absence.status,
            startDate: calendarDayUtc(slot(base, absence.fromDayOffset, 0)),
            endDate: calendarDayUtc(slot(base, absence.toDayOffset, 0)),
            reason: absence.reason,
            decidedByUserId: absence.status === "REQUESTED" ? null : demoId("user:koordinator"),
            decidedAt: absence.status === "REQUESTED" ? null : new Date(base.getTime() - 3 * DAY),
            externalSource: ExternalSource.MANUAL,
          };
          await tx.absence.upsert({
            where: { id },
            update: data,
            create: { id, organizationId: ORG_ID, ...data },
          });
          report.absences += 1;
        }

        // ── Dienstpläne (Soll-Arbeitszeit) ────────────────────────────────
        for (const weekStart of [previousMonday, monday]) {
          for (const caregiver of CAREGIVERS) {
            for (const day of caregiver.workDays) {
              const date = calendarDayUtc(slot(weekStart, DAY_INDEX[day], 12 * 60));
              const id = demoId(`schedule:${caregiver.slug}:${date.toISOString().slice(0, 10)}`);
              const shift = shiftFor(caregiver);
              const data = { caregiverId: demoId(`caregiver:${caregiver.slug}`), date, ...shift };
              await tx.workSchedule.upsert({
                where: { id },
                update: data,
                create: { id, organizationId: ORG_ID, ...data },
              });
              report.workSchedules += 1;
            }
          }
        }

        // ── Visites ───────────────────────────────────────────────────────
        const allVisits = [
          ...buildWeek(previousMonday, -1, options.now),
          ...buildWeek(monday, 0, options.now),
        ];

        for (const visit of allVisits) {
          const pointage = buildPointage(visit);
          const data = {
            patientId: demoId(`patient:${visit.patient.slug}`),
            caregiverId: demoId(`caregiver:${visit.effective.slug}`),
            assignedCaregiverId: demoId(`caregiver:${visit.assigned.slug}`),
            scheduledAt: visit.scheduledAt,
            status: visit.status,
            isEmergency: visit.isEmergency,
            emergencyReason: visit.emergencyReason,
            ...pointage,
          };
          await tx.visit.upsert({
            where: { id: visit.id },
            update: data,
            create: { id: visit.id, organizationId: ORG_ID, ...data },
          });

          report.visits += 1;
          if (visit.status === VisitStatus.COMPLETED) report.completed += 1;
          if (visit.status === VisitStatus.IN_PROGRESS) report.inProgress += 1;
          if (visit.status === VisitStatus.PLANNED) report.planned += 1;
          if (visit.isEmergency) report.emergencies += 1;
          if (visit.replacementMotive) report.replacements += 1;
        }

        // ── Tournées + affectation des véhicules (règle 6) ────────────────
        report.routes = await buildRoutes(tx, allVisits);

        // ── Einwilligungen GPS ────────────────────────────────────────────
        for (const caregiver of CAREGIVERS) {
          if (!caregiver.gpsConsent) continue;
          const id = demoId(`consent:${caregiver.slug}`);
          const data = {
            caregiverId: demoId(`caregiver:${caregiver.slug}`),
            policyVersion: GPS_POLICY_VERSION,
            locale: Locale.DE,
            grantedAt: new Date(`${caregiver.hiredOn}T09:00:00.000Z`),
            revokedAt: null,
          };
          await tx.gpsConsent.upsert({
            where: { id },
            update: data,
            create: { id, organizationId: ORG_ID, ...data },
          });
          report.consents += 1;
        }

        // ── Positions de la visite en cours ───────────────────────────────
        report.positions = await buildLivePositions(tx, allVisits, options.now);

        report.unplannedPatients = UNPLANNED_THIS_WEEK.map((slug) => {
          const patient = requirePatient(slug);
          return `${patient.firstName} ${patient.lastName}`;
        });

        await writeAudit(tx, ctx, {
          action: AuditAction.CREATE,
          entityType: "demo_seed",
          metadata: {
            week: isoDay(monday),
            patients: report.patients,
            caregivers: report.caregivers,
            visits: report.visits,
          },
        });

        if (!options.apply) throw new DryRunRollback(report);
        return report;
      },
      // Le chargement complet fait quelques centaines d'écritures ; le délai
      // par défaut de Prisma (5 s) ne suffit pas sur une base distante.
      { timeout: 180_000, maxWait: 30_000 },
    );

  try {
    return await run();
  } catch (err) {
    if (err instanceof DryRunRollback) return err.report;
    throw err;
  }
}

async function upsertUser(
  tx: TenantTx,
  id: string,
  email: string,
  role: UserRole,
  passwordHash: string,
): Promise<void> {
  const data = {
    role,
    email,
    passwordHash,
    language: Locale.DE,
    isActive: true,
    // Volontairement false : un changement de mot de passe imposé au premier
    // login couperait une démonstration en deux.
    mustChangePassword: false,
  };
  await tx.user.upsert({
    where: { id },
    update: data,
    create: { id, organizationId: ORG_ID, ...data },
  });
}

/** Horaire type : début, fin et pause, déduits du contrat. */
function shiftFor(caregiver: DemoCaregiver): {
  startMinute: number;
  endMinute: number;
  breakMinutes: number;
} {
  const dailyHours = caregiver.weeklyHours / caregiver.workDays.length;
  // § 4 ArbZG : 30 min de pause au-delà de 6 h de travail effectif.
  const breakMinutes = dailyHours > 6 ? 30 : 0;
  const startMinute = caregiver.weeklyHours <= 12 ? 13 * 60 : 7 * 60 + 30;
  return {
    startMinute,
    endMinute: Math.round(startMinute + dailyHours * 60 + breakMinutes),
    breakMinutes,
  };
}

/**
 * Pointage d'une visite terminée ou en cours.
 *
 * Les coordonnées ne sont écrites QUE si la fachkraft a donné son einwilligung
 * et que le patient est géolocalisé. Les horodatages, eux, sont écrits dans
 * tous les cas : une heure d'arrivée relève du temps de travail (§ 16 ArbZG),
 * pas de la localisation, et ne dépend donc pas de cette einwilligung.
 */
interface Pointage {
  gpsArrivalAt: Date | null;
  gpsDepartureAt: Date | null;
  gpsArrivalLat: number | null;
  gpsArrivalLng: number | null;
  gpsArrivalAccuracy: number | null;
  gpsDepartureLat: number | null;
  gpsDepartureLng: number | null;
  gpsDepartureAccuracy: number | null;
}

function buildPointage(visit: PlannedVisit): Pointage {
  if (visit.status !== VisitStatus.COMPLETED && visit.status !== VisitStatus.IN_PROGRESS) {
    return {
      gpsArrivalAt: null,
      gpsDepartureAt: null,
      gpsArrivalLat: null,
      gpsArrivalLng: null,
      gpsArrivalAccuracy: null,
      gpsDepartureLat: null,
      gpsDepartureLng: null,
      gpsDepartureAccuracy: null,
    };
  }

  const arrivalDrift = Math.round(jitter(`${visit.id}:arrival`, 8)) * MINUTE;
  const arrival = new Date(visit.scheduledAt.getTime() + arrivalDrift);
  const duration = visitDurationMinutes(visit.effective.qualification);
  const durationDrift = Math.round(jitter(`${visit.id}:duration`, 6));
  const departure = new Date(arrival.getTime() + (duration + durationDrift) * MINUTE);

  const traceable =
    visit.effective.gpsConsent &&
    visit.patient.latitude !== null &&
    visit.patient.longitude !== null;

  if (!traceable) {
    return {
      gpsArrivalAt: arrival,
      gpsDepartureAt: visit.status === VisitStatus.COMPLETED ? departure : null,
      gpsArrivalLat: null,
      gpsArrivalLng: null,
      gpsArrivalAccuracy: null,
      gpsDepartureLat: null,
      gpsDepartureLng: null,
      gpsDepartureAccuracy: null,
    };
  }

  // ~15 m de dispersion : un téléphone ne pointe jamais sur la coordonnée
  // exacte du patient.
  const lat = visit.patient.latitude! + jitter(`${visit.id}:lat`, 0.00013);
  const lng = visit.patient.longitude! + jitter(`${visit.id}:lng`, 0.0002);

  return {
    gpsArrivalAt: arrival,
    gpsDepartureAt: visit.status === VisitStatus.COMPLETED ? departure : null,
    gpsArrivalLat: lat,
    gpsArrivalLng: lng,
    gpsArrivalAccuracy: 8 + Math.abs(jitter(`${visit.id}:acc`, 6)),
    gpsDepartureLat: visit.status === VisitStatus.COMPLETED ? lat : null,
    gpsDepartureLng: visit.status === VisitStatus.COMPLETED ? lng : null,
    gpsDepartureAccuracy: visit.status === VisitStatus.COMPLETED ? 9 : null,
  };
}

/**
 * Une tournée par fachkraft et par jour, véhicule affecté selon la règle 6.
 *
 * L'arbitrage se fait jour par jour : les tournées du jour sont triées par
 * distance décroissante, les véhicules par km déjà parcourus croissants, puis
 * appariés. Le véhicule le moins roulé prend donc la tournée la plus longue.
 * Il y a trois véhicules pour cinq fachkräfte : les tournées les plus courtes
 * repartent sans voiture, ce qui est le cas réel en centre-ville.
 */
async function buildRoutes(tx: TenantTx, visits: PlannedVisit[]): Promise<number> {
  const byDayAndCaregiver = new Map<string, PlannedVisit[]>();
  for (const visit of visits) {
    if (visit.isEmergency) continue; // hors tournée, par définition
    const key = `${isoDay(visit.scheduledAt)}|${visit.effective.slug}`;
    const bucket = byDayAndCaregiver.get(key);
    if (bucket) bucket.push(visit);
    else byDayAndCaregiver.set(key, [visit]);
  }

  const vehiclesByKm = [...VEHICLES].sort((a, b) => a.leasingKmUsed - b.leasingKmUsed);
  const days = new Map<string, { caregiverSlug: string; visits: PlannedVisit[]; km: number | null }[]>();

  for (const [key, bucket] of byDayAndCaregiver) {
    const [day, caregiverSlug] = key.split("|") as [string, string];
    const ordered = [...bucket].sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime());
    const stops = ordered.map((v) =>
      v.patient.latitude !== null && v.patient.longitude !== null
        ? { latitude: v.patient.latitude, longitude: v.patient.longitude }
        : null,
    );
    const entry = { caregiverSlug, visits: ordered, km: routeKm(stops) };
    const list = days.get(day);
    if (list) list.push(entry);
    else days.set(day, [entry]);
  }

  let created = 0;
  for (const [day, routes] of days) {
    // Tournée la plus longue en tête (règle 6). Une tournée dont la distance
    // est inconnue passe en dernier : on ne peut pas lui attribuer le véhicule
    // le moins roulé au motif d'une longueur qu'on ignore.
    const ranked = [...routes].sort((a, b) => (b.km ?? -1) - (a.km ?? -1));

    for (const [index, route] of ranked.entries()) {
      const vehicle = vehiclesByKm[index];
      const id = demoId(`route:${route.caregiverSlug}:${day}`);
      const date = new Date(`${day}T00:00:00.000Z`);
      // La semaine écoulée a été optimisée, la semaine en cours ne l'est pas
      // encore : la démonstration peut ainsi lancer le VRPTW devant le client
      // et comparer avec le résultat de la semaine précédente.
      const isPast = date.getTime() < Date.now() - 3 * DAY;
      const data = {
        caregiverId: demoId(`caregiver:${route.caregiverSlug}`),
        vehicleId: vehicle ? demoId(`vehicle:${vehicle.slug}`) : null,
        date,
        visitsOrder: route.visits.map((v) => v.id),
        optimized: isPast,
        vrptwScore: isPast ? 78 + Math.abs(jitter(`score:${id}`, 14)) : null,
        totalKm: route.km,
      };
      await tx.route.upsert({
        where: { id },
        update: data,
        create: { id, organizationId: ORG_ID, ...data },
      });
      await tx.visit.updateMany({
        where: { id: { in: route.visits.map((v) => v.id) } },
        data: { routeId: id },
      });
      created += 1;
    }
  }

  return created;
}

/**
 * Quelques positions sur la visite en cours, pour que la carte de suivi ne
 * s'ouvre pas vide. Rien n'est écrit sans einwilligung en cours : c'est
 * précisément ce que contrôle `pnpm check:gps-consent`, et le jeu de
 * démonstration doit passer ce contrôle comme la production.
 */
async function buildLivePositions(tx: TenantTx, visits: PlannedVisit[], now: Date): Promise<number> {
  const live = visits.filter(
    (v) =>
      v.status === VisitStatus.IN_PROGRESS &&
      v.effective.gpsConsent &&
      v.patient.latitude !== null &&
      v.patient.longitude !== null,
  );

  let created = 0;
  for (const visit of live) {
    for (let i = 0; i < 4; i += 1) {
      const id = demoId(`position:${visit.id}:${i}`);
      const data = {
        caregiverId: demoId(`caregiver:${visit.effective.slug}`),
        visitId: visit.id,
        latitude: visit.patient.latitude! + jitter(`${id}:lat`, 0.0002),
        longitude: visit.patient.longitude! + jitter(`${id}:lng`, 0.0003),
        accuracy: 7 + Math.abs(jitter(`${id}:acc`, 5)),
        distanceToPatientM: Math.abs(jitter(`${id}:dist`, 40)),
        geofenceBreach: false,
        recordedAt: new Date(now.getTime() - (3 - i) * 4 * MINUTE),
      };
      await tx.gpsPosition.upsert({
        where: { id },
        update: data,
        create: { id, organizationId: ORG_ID, ...data },
      });
      created += 1;
    }
  }
  return created;
}

/**
 * Efface l'organisation de démonstration.
 *
 * Volontairement limité à l'UUID dérivé du slug : le script ne peut pas
 * supprimer une organisation cliente, même sur une mauvaise base. Le reste
 * part en cascade (voir onDelete: Cascade dans le schéma).
 */
async function resetDemoOrg(tx: TenantTx): Promise<void> {
  await tx.organization.deleteMany({ where: { id: ORG_ID } });
}

// ── Vérification ──────────────────────────────────────────────────────────

interface Check {
  label: string;
  ok: boolean;
  detail: string;
}

/**
 * Relit la base et confronte les données aux règles métier.
 *
 * Le script pourrait se contenter d'écrire et d'annoncer « terminé ». Ce
 * contrôle existe parce qu'une donnée de démonstration invalide se voit en
 * rendez-vous, pas avant : un patient avec deux visites dans la semaine, un
 * remplaçant sans la bonne qualification, une visite un jour non travaillé.
 */
async function verify(weekOf: Date): Promise<Check[]> {
  const monday = startOfISOWeek(weekOf);
  const previousMonday = new Date(monday.getTime() - 7 * DAY);
  const checks: Check[] = [];

  const visits = await prisma.visit.findMany({
    where: { organizationId: ORG_ID, scheduledAt: { gte: previousMonday } },
    include: {
      patient: { select: { firstName: true, lastName: true } },
      caregiver: { select: { firstName: true, lastName: true, qualification: true, workDays: true } },
      assignedCaregiver: { select: { firstName: true, lastName: true, qualification: true } },
    },
    orderBy: { scheduledAt: "asc" },
  });

  // Règle 1 : au plus une visite régulière par patient et par semaine.
  const perPatientWeek = new Map<string, number>();
  for (const visit of visits) {
    if (visit.isEmergency || visit.status === VisitStatus.CANCELED) continue;
    const key = `${visit.patientId}|${isoDay(startOfISOWeek(visit.scheduledAt))}`;
    perPatientWeek.set(key, (perPatientWeek.get(key) ?? 0) + 1);
  }
  const duplicates = [...perPatientWeek.values()].filter((n) => n > 1).length;
  checks.push({
    label: "Règle 1 — une visite régulière par patient et par semaine",
    ok: duplicates === 0,
    detail: duplicates === 0 ? `${perPatientWeek.size} couples patient/semaine, aucun doublon` : `${duplicates} doublon(s)`,
  });

  // Règle 5 : la visite tombe un jour travaillé de la fachkraft effective.
  const offDay = visits.filter(
    (v) => !v.isEmergency && v.caregiver && !isWorkDay(v.caregiver, v.scheduledAt),
  );
  checks.push({
    label: "Règle 5 — visite un jour travaillé de la fachkraft",
    ok: offDay.length === 0,
    detail:
      offDay.length === 0
        ? `${visits.length} visite(s) contrôlée(s)`
        : offDay
            .map((v) => `${v.caregiver?.lastName} le ${weekdayCode(v.scheduledAt)}`)
            .join(", "),
  });

  // Règle 4 : remplaçant à qualification égale.
  const replacements = visits.filter(
    (v) => v.caregiverId && v.assignedCaregiverId && v.caregiverId !== v.assignedCaregiverId,
  );
  const mismatched = replacements.filter(
    (v) =>
      v.caregiver &&
      v.assignedCaregiver &&
      !sameQualification(v.caregiver.qualification, v.assignedCaregiver.qualification),
  );
  checks.push({
    label: "Règle 4 — remplacement à qualification égale",
    ok: mismatched.length === 0,
    detail:
      mismatched.length === 0
        ? `${replacements.length} remplacement(s), tous conformes`
        : mismatched.map((v) => `${v.caregiver?.lastName} pour ${v.assignedCaregiver?.lastName}`).join(", "),
  });

  // Règle 3 : l'alerte a bien quelque chose à signaler.
  const weekEnd = new Date(monday.getTime() + 7 * DAY);
  const missing = await prisma.patient.findMany({
    where: {
      organizationId: ORG_ID,
      isActive: true,
      visits: {
        none: {
          isEmergency: false,
          status: { in: [VisitStatus.PLANNED, VisitStatus.IN_PROGRESS, VisitStatus.COMPLETED] },
          scheduledAt: { gte: monday, lt: weekEnd },
        },
      },
    },
    select: { firstName: true, lastName: true },
  });
  checks.push({
    label: "Règle 3 — alerte « patient sans visite cette semaine »",
    ok: missing.length === UNPLANNED_THIS_WEEK.length,
    detail: missing.map((p) => `${p.firstName} ${p.lastName}`).join(", ") || "aucun",
  });

  // Règle 7 : au moins une adresse invalide, pour montrer le blocage VRPTW.
  const invalid = await prisma.patient.count({
    where: { organizationId: ORG_ID, geocodingStatus: GeocodingStatus.INVALID },
  });
  checks.push({
    label: "Règle 7 — adresse invalide bloquant l'optimisation",
    ok: invalid > 0,
    detail: `${invalid} patient(s) en geocodingStatus INVALID`,
  });

  // Règle 6 : le véhicule le moins roulé prend la tournée la plus longue du
  // jour. Le contrôle vérifie aussi qu'aucune tournée n'affiche 0 km – une
  // distance nulle sur une tournée qui a des visites est une distance
  // inconnue mal représentée, pas une tournée sans trajet.
  const routes = await prisma.route.findMany({
    where: { organizationId: ORG_ID },
    select: { date: true, totalKm: true, vehicle: { select: { leasingKmUsed: true } } },
  });
  const zeroKm = routes.filter((r) => r.totalKm !== null && Number(r.totalKm) === 0);

  const byDay = new Map<string, typeof routes>();
  for (const route of routes) {
    const key = route.date.toISOString().slice(0, 10);
    const bucket = byDay.get(key);
    if (bucket) bucket.push(route);
    else byDay.set(key, [route]);
  }
  let leasingViolations = 0;
  for (const bucket of byDay.values()) {
    const measured = bucket.filter((r) => r.totalKm !== null && r.vehicle);
    if (measured.length < 2) continue;
    const longest = measured.reduce((a, b) => (Number(a.totalKm) >= Number(b.totalKm) ? a : b));
    const leastUsed = measured.reduce((a, b) =>
      a.vehicle!.leasingKmUsed <= b.vehicle!.leasingKmUsed ? a : b,
    );
    if (longest !== leastUsed) leasingViolations += 1;
  }
  checks.push({
    label: "Règle 6 — tournée la plus longue au véhicule le moins roulé",
    ok: leasingViolations === 0 && zeroKm.length === 0,
    detail:
      leasingViolations === 0 && zeroKm.length === 0
        ? `${routes.length} tournée(s), dont ${routes.filter((r) => r.totalKm === null).length} sans distance calculable (patient non géolocalisé)`
        : `${leasingViolations} jour(s) mal arbitré(s), ${zeroKm.length} tournée(s) à 0 km`,
  });

  // DSGVO : aucune position sans einwilligung en cours.
  const consented = new Set(
    (
      await prisma.gpsConsent.findMany({
        where: { organizationId: ORG_ID, revokedAt: null, policyVersion: GPS_POLICY_VERSION },
        select: { caregiverId: true },
      })
    ).map((c) => c.caregiverId),
  );
  const tracked = await prisma.gpsPosition.groupBy({
    by: ["caregiverId"],
    where: { organizationId: ORG_ID },
    _count: { _all: true },
  });
  const uncovered = tracked.filter((t) => !consented.has(t.caregiverId));
  checks.push({
    label: "DSGVO — aucune position sans einwilligung en cours",
    ok: uncovered.length === 0,
    detail:
      uncovered.length === 0
        ? `${tracked.length} fachkraft/fachkräfte suivie(s), toutes couvertes`
        : `${uncovered.length} fachkraft/fachkräfte sans einwilligung`,
  });

  // Pointages GPS : idem, sur les coordonnées portées par les visites.
  const pointedWithoutConsent = visits.filter(
    (v) => v.gpsArrivalLat !== null && v.caregiverId && !consented.has(v.caregiverId),
  );
  checks.push({
    label: "DSGVO — aucun pointage géolocalisé sans einwilligung",
    ok: pointedWithoutConsent.length === 0,
    detail:
      pointedWithoutConsent.length === 0
        ? "conforme"
        : `${pointedWithoutConsent.length} pointage(s) à corriger`,
  });

  return checks;
}

// ── Exécution ─────────────────────────────────────────────────────────────

function line(): void {
  console.log("─".repeat(78));
}

const options = parseArgs(process.argv.slice(2));
const monday = startOfISOWeek(options.weekOf);

console.log(`Base           : ${new URL(process.env.DATABASE_URL ?? "postgres://?").hostname}`);
console.log(`Organisation   : ${DEMO_ORG_NAME} (${ORG_ID})`);
console.log(`Semaine visée  : ${isoDay(monday)} → ${isoDay(new Date(monday.getTime() + 6 * DAY))}`);
console.log(`Référence      : ${options.now.toISOString()} (${APP_TIME_ZONE})`);
console.log(`Mode           : ${options.apply ? "ÉCRITURE" : "DRY-RUN (rien ne sera écrit)"}${options.reset ? " + RESET" : ""}`);
line();

// Le hachage Argon2id est volontairement fait AVANT d'ouvrir la transaction :
// il coûte des centaines de millisecondes et n'a rien à faire dans un verrou.
const passwordHash = await hashPassword(options.password);

const report = await seed(options, passwordHash);

console.log("CHARGEMENT");
console.log(`  Comptes            ${report.users}   (3 encadrement + ${CAREGIVERS.length} fachkräfte)`);
console.log(`  Fachkräfte         ${report.caregivers}   avec ${report.contracts} contrat(s) en vigueur`);
console.log(`  Patients           ${report.patients}`);
console.log(`  Véhicules          ${report.vehicles}`);
console.log(`  Dienstpläne        ${report.workSchedules}`);
console.log(`  Absences           ${report.absences}`);
console.log(`  Tournées           ${report.routes}`);
console.log(
  `  Visites            ${report.visits}   (${report.completed} terminées, ${report.inProgress} en cours, ${report.planned} à venir)`,
);
console.log(`  dont urgences      ${report.emergencies}`);
console.log(`  dont remplacements ${report.replacements}`);
console.log(`  Einwilligungen GPS ${report.consents} / ${CAREGIVERS.length}`);
console.log(`  Positions GPS      ${report.positions}`);
if (report.unplannedPatients.length > 0) {
  console.log(`  Sans visite (voulu) ${report.unplannedPatients.join(", ")}`);
}
line();

if (options.apply) {
  const checks = await verify(options.weekOf);
  console.log("VÉRIFICATION (relecture en base)");
  for (const check of checks) {
    console.log(`  ${check.ok ? "OK  " : "ÉCHEC"} ${check.label}`);
    console.log(`       ${check.detail}`);
  }
  line();

  const failed = checks.filter((c) => !c.ok);
  if (failed.length > 0) {
    console.error(`${failed.length} contrôle(s) en échec — le jeu de démonstration n'est pas montrable en l'état.`);
    process.exitCode = 1;
  } else {
    console.log("ACCÈS");
    console.log(`  Mot de passe (tous les comptes) : ${options.password}`);
    for (const staff of STAFF_USERS) console.log(`  ${staff.role.padEnd(15)} ${staff.email}`);
    for (const caregiver of CAREGIVERS) {
      console.log(`  ${"FACHKRAFT".padEnd(15)} ${caregiver.email}  (${caregiver.qualification})`);
    }
    line();
    console.log("Les visites sont datées de la semaine en cours : relancer le script avant");
    console.log("chaque démonstration pour que les tournées retombent sur la bonne semaine.");
  }
} else {
  console.log("Aucune écriture effectuée. Relancer avec --apply pour appliquer.");
}

await prisma.$disconnect();
