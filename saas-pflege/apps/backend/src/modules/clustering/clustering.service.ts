/**
 * Découpage géographique quotidien.
 *
 * Regroupe les patients à visiter un jour donné en secteurs cohérents, avant
 * que le VRPTW n'ordonne les arrêts à l'intérieur de chacun. Les deux étapes
 * répondent à des questions différentes : le clustering dit QUI va ensemble,
 * le VRPTW dit DANS QUEL ORDRE. Lancer le VRPTW sur une journée entière sans
 * découpage préalable revient à lui demander une tournée unique de quarante
 * patients, que personne ne peut effectuer.
 *
 * Le calcul est SANS EFFET DE BORD : il lit des visites et renvoie une
 * proposition. Rien n'est écrit, aucune tournée n'est créée. C'est délibéré à
 * ce stade : la validation appartient à la coordination (accepter, ajuster,
 * rejeter), et un découpage écrit avant validation serait un découpage imposé.
 *
 * DETTE ASSUMÉE (Phase 2) : une table `clustering_sessions` devra porter le
 * découpage validé. Deux besoins que l'état client ne couvre pas — l'historique
 * (quel découpage a été retenu, par qui, comparé au réalisé) et la
 * ré-optimisation en cours de journée, qui doit repartir du découpage validé le
 * matin plutôt que d'en recalculer un qui redistribuerait des tournées déjà
 * commencées. Voir CLAUDE.md, section Clustering géographique quotidien.
 */

import {
  AuditAction,
  GeocodingStatus,
  SubscriptionPlan,
  VisitStatus,
  withTenant,
} from "@len-len/database";
import { AppError } from "../../lib/errors.js";
import { writeAudit } from "../../lib/audit.js";
import { centroid, haversineKm, maxPairwiseKm, type GeoPoint } from "../../lib/geo.js";
import { dbscan } from "../../lib/clustering/dbscan.js";
import { kmeans } from "../../lib/clustering/kmeans.js";
import type { ClusterPoint, ClusteringAlgorithm } from "../../lib/clustering/types.js";
import { resolvePlanLimits } from "../billing/plan.js";
import { dayRange, weekdayCode } from "../../lib/week.js";
import { workDaysOf } from "../visits/visit.rules.js";
import type { TenantContext } from "../../lib/context.js";
import type { DailyClusteringInput } from "./clustering.schemas.js";

/**
 * Au-delà de ce nombre de patients dans la journée, le calcul part en file
 * d'attente au lieu de bloquer la requête.
 *
 * 200 patients en O(n²) représentent 40 000 distances, quelques dizaines de
 * millisecondes : très en dessous de ce qui justifierait une file. Le seuil
 * n'est donc pas là pour le temps de calcul mais pour la garantie : l'API ne
 * doit JAMAIS être bloquante (CLAUDE.md, « VRPTW et KI 100% asynchrones »), et
 * une limite explicite vaut mieux qu'un pari sur la taille des structures.
 */
export const SYNC_PATIENT_THRESHOLD = 200;

/** Rayon de voisinage par défaut : un secteur urbain tient dans 2 km. */
const DEFAULT_EPSILON_KM = 2;
/** Deux patients suffisent à faire un secteur ; un seul reste isolé. */
const DEFAULT_MIN_POINTS = 2;

// ── Contrat de sortie ─────────────────────────────────────────────────────

export interface ClusteredPatient {
  patientId: string;
  visitId: string;
  firstName: string;
  lastName: string;
  latitude: number;
  longitude: number;
  scheduledAt: string;
  /** Fachkraft attitrée du patient, si elle existe. */
  assignedCaregiverId: string | null;
}

export interface SuggestedCaregiver {
  id: string;
  firstName: string;
  lastName: string;
  qualification: string;
  /** Distance entre le centre du secteur de la fachkraft et celui du cluster. */
  distanceKm: number;
}

export interface Cluster {
  /** Rang stable dans la réponse, utilisé comme clé par l'interface. */
  index: number;
  patientCount: number;
  /** Diamètre du cluster : plus grande distance entre deux de ses patients. */
  maxDistanceKm: number;
  centroid: GeoPoint;
  patients: ClusteredPatient[];
  suggestedCaregiver: SuggestedCaregiver | null;
  /**
   * Tournée DÉJÀ existante de la fachkraft suggérée, ce jour-là.
   *
   * Sans elle, le bouton « Lancer le VRPTW » de l'interface n'aurait aucune
   * cible : le VRPTW optimise une tournée identifiée, or un secteur n'en est
   * pas une et rien n'est persisté à ce stade. `null` signifie qu'aucune
   * tournée n'existe encore pour cette fachkraft ce jour-là — il faudra la
   * créer avant d'optimiser, ce que ce module ne fait pas.
   */
  routeId: string | null;
}

export interface DailyClusteringResult {
  date: string;
  algorithm: ClusteringAlgorithm;
  patientCount: number;
  clusters: Cluster[];
  /**
   * Patients qu'aucun secteur n'a absorbés (DBSCAN uniquement). Ils sont
   * RENVOYÉS et non tus : une adresse isolée est une décision à prendre, pas
   * un détail à masquer.
   */
  unassigned: ClusteredPatient[];
}

// ── Garde-fous ────────────────────────────────────────────────────────────

/**
 * Le clustering automatique n'est pas inclus dans le plan Basic.
 *
 * Le test porte sur la capacité `ki` des limites de plan et non sur le nom du
 * plan : c'est le même interrupteur qui distingue déjà Basic de Pro, et il
 * respecte les surcharges négociées par tenant (`organizations.plan_limits`).
 * Une structure Basic à qui l'on a ouvert la capacité y aura donc droit, sans
 * qu'il faille toucher au code.
 *
 * Le code HTTP est 402, comme partout ailleurs dans le produit sur un blocage
 * lié au plan. Ce n'est pas cosmétique : quatre pages du frontend testent
 * `err.status === 402` pour proposer la montée en gamme. Un 403 aurait été
 * traité comme une erreur d'autorisation quelconque et serait passé sous
 * silence, sans jamais offrir la sortie au client.
 *
 * Le code d'erreur reste distinct de `PaymentRequired` : atteindre une limite
 * (« trop de patients ») et ne pas disposer d'une fonction sont deux
 * situations différentes, qui appellent deux messages différents. Le statut
 * porte la mécanique commune, le code porte la nuance.
 */
export async function assertPlanAllowsClustering(organizationId: string): Promise<SubscriptionPlan> {
  const org = await withTenant(organizationId, async (tx) =>
    tx.organization.findFirst({
      where: { id: organizationId },
      select: { subscriptionPlan: true, planLimits: true },
    }),
  );
  if (!org) throw new AppError(404, "Organisation nicht gefunden", "NotFound");

  const limits = resolvePlanLimits(org.subscriptionPlan, org.planLimits);
  if (!limits.ki) {
    throw new AppError(
      402,
      "Automatische Gebietsaufteilung ist im Basic-Plan nicht enthalten.",
      "PlanFeatureUnavailable",
    );
  }
  return org.subscriptionPlan;
}

// ── Calcul ────────────────────────────────────────────────────────────────

interface DayData {
  patients: ClusteredPatient[];
  caregivers: {
    id: string;
    firstName: string;
    lastName: string;
    qualification: string;
    sector: GeoPoint | null;
  }[];
}

/**
 * Lit les visites du jour et le secteur de chaque fachkraft disponible.
 *
 * Le « secteur » d'une fachkraft est le centroïde des patients qui lui sont
 * attitrés. C'est la seule définition que le modèle de données permette
 * aujourd'hui, et elle est fidèle au métier : une fachkraft n'a pas de zone
 * déclarée, elle a une patientèle, et cette patientèle EST sa zone. Une
 * fachkraft sans patient attitré n'a donc pas de secteur et ne peut pas être
 * suggérée – la suggestion serait un tirage au sort déguisé.
 */
async function loadDay(ctx: TenantContext, date: Date): Promise<DayData> {
  const { start, end } = dayRange(date);
  const weekday = weekdayCode(date);

  return withTenant(ctx.organizationId, async (tx) => {
    const visits = await tx.visit.findMany({
      where: {
        organizationId: ctx.organizationId,
        status: { not: VisitStatus.CANCELED },
        scheduledAt: { gte: start, lt: end },
      },
      select: {
        id: true,
        scheduledAt: true,
        patient: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            latitude: true,
            longitude: true,
            geocodingStatus: true,
            assignedCaregiverId: true,
            isActive: true,
          },
        },
      },
      orderBy: { scheduledAt: "asc" },
    });

    // Règle 7 : le découpage est bloqué tant qu'une adresse du jour n'est pas
    // valablement géocodée. Regrouper sur une coordonnée absente ou fausse
    // produirait un secteur faux, que le VRPTW transformerait ensuite en
    // tournée fausse – l'erreur se propagerait sans jamais être signalée.
    const blocking = visits.filter(
      (v) =>
        v.patient.geocodingStatus !== GeocodingStatus.VALID ||
        v.patient.latitude === null ||
        v.patient.longitude === null,
    );
    if (blocking.length > 0) {
      const names = blocking
        .slice(0, 5)
        .map((v) => `${v.patient.firstName} ${v.patient.lastName}`)
        .join(", ");
      throw new AppError(
        409,
        `Gebietsaufteilung blockiert: ${blocking.length} Patient(en) ohne gültige Geokodierung (${names}${blocking.length > 5 ? ", …" : ""}).`,
        "GeocodingIncomplete",
      );
    }

    const patients: ClusteredPatient[] = visits.map((v) => ({
      patientId: v.patient.id,
      visitId: v.id,
      firstName: v.patient.firstName,
      lastName: v.patient.lastName,
      latitude: Number(v.patient.latitude),
      longitude: Number(v.patient.longitude),
      scheduledAt: v.scheduledAt.toISOString(),
      assignedCaregiverId: v.patient.assignedCaregiverId,
    }));

    // Seules les fachkräfte réellement mobilisables ce jour-là : actives et
    // travaillant ce jour de la semaine (règle 5). Suggérer quelqu'un qui ne
    // travaille pas jeudi n'aide personne.
    const caregiverRows = await tx.caregiver.findMany({
      where: { organizationId: ctx.organizationId, isActive: true },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        qualification: true,
        workDays: true,
        assignedPatients: {
          where: { isActive: true, geocodingStatus: GeocodingStatus.VALID },
          select: { latitude: true, longitude: true },
        },
      },
    });

    const caregivers = caregiverRows
      .filter((c) => workDaysOf(c).includes(weekday))
      .map((c) => {
        const points = c.assignedPatients
          .filter((p) => p.latitude !== null && p.longitude !== null)
          .map((p) => ({ lat: Number(p.latitude), lng: Number(p.longitude) }));
        return {
          id: c.id,
          firstName: c.firstName,
          lastName: c.lastName,
          qualification: String(c.qualification),
          sector: points.length > 0 ? centroid(points) : null,
        };
      });

    return { patients, caregivers };
  });
}

/**
 * Associe une fachkraft à chaque secteur, au plus proche.
 *
 * L'attribution est EXCLUSIVE : une fachkraft déjà suggérée ailleurs ne l'est
 * plus. Sans cette contrainte, la même personne serait proposée pour trois
 * secteurs voisins et la proposition n'aurait aucun sens opérationnel. Les
 * couples (secteur, fachkraft) sont donc triés par distance croissante et
 * consommés dans cet ordre : le meilleur appariement global d'abord.
 */
function suggestCaregivers(
  clusters: { centroid: GeoPoint }[],
  caregivers: DayData["caregivers"],
): (SuggestedCaregiver | null)[] {
  const candidates = caregivers.filter((c) => c.sector !== null);
  const pairs: { clusterIndex: number; caregiverIndex: number; distanceKm: number }[] = [];

  for (let ci = 0; ci < clusters.length; ci += 1) {
    for (let gi = 0; gi < candidates.length; gi += 1) {
      pairs.push({
        clusterIndex: ci,
        caregiverIndex: gi,
        distanceKm: haversineKm(clusters[ci]!.centroid, candidates[gi]!.sector!),
      });
    }
  }
  pairs.sort((a, b) => a.distanceKm - b.distanceKm);

  const result: (SuggestedCaregiver | null)[] = new Array(clusters.length).fill(null);
  const takenCaregivers = new Set<number>();
  const filledClusters = new Set<number>();

  for (const pair of pairs) {
    if (filledClusters.has(pair.clusterIndex) || takenCaregivers.has(pair.caregiverIndex)) continue;
    const caregiver = candidates[pair.caregiverIndex]!;
    result[pair.clusterIndex] = {
      id: caregiver.id,
      firstName: caregiver.firstName,
      lastName: caregiver.lastName,
      qualification: caregiver.qualification,
      distanceKm: Math.round(pair.distanceKm * 100) / 100,
    };
    filledClusters.add(pair.clusterIndex);
    takenCaregivers.add(pair.caregiverIndex);
  }

  return result;
}

/**
 * Calcule le découpage d'une journée. Utilisé par la voie synchrone comme par
 * le worker : une seule implémentation, donc un seul comportement.
 */
export async function computeDailyClustering(
  ctx: TenantContext,
  input: DailyClusteringInput,
): Promise<DailyClusteringResult> {
  await assertPlanAllowsClustering(ctx.organizationId);

  const date = new Date(`${input.date}T12:00:00.000Z`);
  const { patients, caregivers } = await loadDay(ctx, date);

  if (patients.length === 0) {
    return {
      date: input.date,
      algorithm: input.algorithm,
      patientCount: 0,
      clusters: [],
      unassigned: [],
    };
  }

  const points: ClusterPoint[] = patients.map((p) => ({
    id: p.patientId,
    lat: p.latitude,
    lng: p.longitude,
  }));

  const outcome =
    input.algorithm === "kmeans"
      ? kmeans(points, { k: input.k! })
      : dbscan(points, {
          epsilonKm: input.epsilonKm ?? DEFAULT_EPSILON_KM,
          minPoints: input.minPoints ?? DEFAULT_MIN_POINTS,
        });

  // Un même patient peut avoir plusieurs visites dans la journée (une urgence
  // s'ajoute à la visite régulière). Le regroupement se fait sur le PATIENT,
  // donc sur sa position, mais la sortie doit rendre toutes ses visites.
  const visitsByPatient = new Map<string, ClusteredPatient[]>();
  for (const patient of patients) {
    const bucket = visitsByPatient.get(patient.patientId);
    if (bucket) bucket.push(patient);
    else visitsByPatient.set(patient.patientId, [patient]);
  }
  const expand = (ids: string[]): ClusteredPatient[] =>
    ids.flatMap((id) => visitsByPatient.get(id) ?? []);

  const bare = outcome.clusters.map((ids) => {
    const members = ids.map((id) => {
      const first = visitsByPatient.get(id)![0]!;
      return { lat: first.latitude, lng: first.longitude };
    });
    return { centroid: centroid(members), members };
  });

  const suggestions = suggestCaregivers(bare, caregivers);

  // Tournées existantes des fachkräfte suggérées, pour que l'interface puisse
  // enchaîner sur l'optimisation. `date` est une colonne @db.Date : la
  // comparaison se fait sur le jour calendaire à minuit UTC, exactement ce que
  // produit la chaîne YYYY-MM-DD reçue en entrée.
  const suggestedIds = suggestions.filter((s): s is SuggestedCaregiver => s !== null).map((s) => s.id);
  const routeByCaregiver = new Map<string, string>();
  if (suggestedIds.length > 0) {
    const routes = await withTenant(ctx.organizationId, async (tx) =>
      tx.route.findMany({
        where: {
          organizationId: ctx.organizationId,
          date: new Date(`${input.date}T00:00:00.000Z`),
          caregiverId: { in: suggestedIds },
        },
        select: { id: true, caregiverId: true },
      }),
    );
    for (const route of routes) {
      if (route.caregiverId) routeByCaregiver.set(route.caregiverId, route.id);
    }
  }

  const clusters: Cluster[] = bare.map((cluster, index) => {
    const suggested = suggestions[index] ?? null;
    return {
      index,
      patientCount: outcome.clusters[index]!.length,
      maxDistanceKm: Math.round(maxPairwiseKm(cluster.members) * 100) / 100,
      centroid: {
        lat: Math.round(cluster.centroid.lat * 1e6) / 1e6,
        lng: Math.round(cluster.centroid.lng * 1e6) / 1e6,
      },
      patients: expand(outcome.clusters[index]!),
      suggestedCaregiver: suggested,
      routeId: suggested ? (routeByCaregiver.get(suggested.id) ?? null) : null,
    };
  });

  const result: DailyClusteringResult = {
    date: input.date,
    algorithm: input.algorithm,
    patientCount: visitsByPatient.size,
    clusters,
    unassigned: expand(outcome.noise),
  };

  await withTenant(ctx.organizationId, async (tx) => {
    await writeAudit(tx, ctx, {
      action: AuditAction.READ,
      entityType: "clustering",
      metadata: {
        date: input.date,
        algorithm: input.algorithm,
        patientCount: result.patientCount,
        clusterCount: clusters.length,
        unassigned: result.unassigned.length,
      },
    });
  });

  return result;
}

/**
 * Nombre de patients concernés par la journée, sans lancer le calcul.
 * Sert uniquement à trancher entre voie synchrone et file d'attente.
 */
export async function countDailyPatients(ctx: TenantContext, date: string): Promise<number> {
  const { start, end } = dayRange(new Date(`${date}T12:00:00.000Z`));
  return withTenant(ctx.organizationId, async (tx) => {
    const rows = await tx.visit.findMany({
      where: {
        organizationId: ctx.organizationId,
        status: { not: VisitStatus.CANCELED },
        scheduledAt: { gte: start, lt: end },
      },
      select: { patientId: true },
      distinct: ["patientId"],
    });
    return rows.length;
  });
}
