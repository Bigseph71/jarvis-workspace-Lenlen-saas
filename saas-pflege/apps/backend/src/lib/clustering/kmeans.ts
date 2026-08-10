/**
 * K-means (Lloyd) avec initialisation k-means++, sans dépendance externe.
 *
 * Proposé en complément de DBSCAN, pas en remplacement. Il répond à un besoin
 * différent et parfaitement légitime : « j'ai quatre fachkräfte disponibles
 * jeudi, donne-moi quatre secteurs ». DBSCAN ne sait pas répondre à ça, il
 * déduit le nombre de groupes de la densité et peut en sortir deux ou sept.
 * Quand la contrainte est l'effectif et non la géographie, c'est k-means qu'il
 * faut, en acceptant sa contrepartie : il classe TOUT, donc un patient isolé
 * sera rattaché à un secteur même s'il en est très loin.
 *
 * ── Déterminisme ─────────────────────────────────────────────────────────
 * k-means++ tire ses centres au hasard. Un aléa non maîtrisé donnerait un
 * découpage différent à chaque appel : la coordination ne pourrait ni comparer
 * deux propositions, ni retrouver celle qu'elle avait validée la veille, et
 * aucun test ne pourrait affirmer quoi que ce soit. Le générateur est donc
 * amorcé par une graine fixe, dérivée du jeu de points lui-même.
 */

import { centroid, haversineKm, type GeoPoint } from "../geo.js";
import type { ClusterPoint, ClusteringOutcome } from "./types.js";

export interface KmeansOptions {
  /** Nombre de groupes voulu. */
  k: number;
  /** Garde-fou contre une convergence qui traîne. */
  maxIterations?: number;
}

const DEFAULT_MAX_ITERATIONS = 100;

/**
 * Générateur pseudo-aléatoire déterministe (mulberry32).
 *
 * Math.random ferait l'affaire pour la qualité statistique, mais pas pour la
 * reproductibilité, qui est ici la propriété qui compte.
 */
function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Graine dérivée des points : mêmes points, même découpage. */
function seedFrom(points: ClusterPoint[]): number {
  let hash = 2166136261;
  for (const point of points) {
    for (const char of point.id) {
      hash ^= char.charCodeAt(0);
      hash = Math.imul(hash, 16777619);
    }
  }
  return hash >>> 0;
}

/** Indice du centre le plus proche. */
function nearestCentre(point: GeoPoint, centres: GeoPoint[]): number {
  let best = 0;
  let bestDistance = haversineKm(point, centres[0]!);
  for (let i = 1; i < centres.length; i += 1) {
    const distance = haversineKm(point, centres[i]!);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = i;
    }
  }
  return best;
}

/**
 * Initialisation k-means++ : le premier centre est tiré au hasard, chaque
 * suivant est tiré avec une probabilité proportionnelle au CARRÉ de sa
 * distance au centre le plus proche déjà retenu. Cela écarte les centres les
 * uns des autres et évite le défaut classique d'un tirage uniforme, où deux
 * centres atterrissent dans le même quartier et où l'un des groupes reste vide.
 */
function initialCentres(points: ClusterPoint[], k: number, random: () => number): GeoPoint[] {
  const centres: GeoPoint[] = [{ lat: points[0]!.lat, lng: points[0]!.lng }];
  const firstIndex = Math.floor(random() * points.length);
  centres[0] = { lat: points[firstIndex]!.lat, lng: points[firstIndex]!.lng };

  while (centres.length < k) {
    const weights = points.map((point) => {
      const distance = haversineKm(point, centres[nearestCentre(point, centres)]!);
      return distance * distance;
    });
    const total = weights.reduce((sum, weight) => sum + weight, 0);

    // Tous les points restants coïncident avec un centre : le tirage pondéré
    // n'a plus de sens, on complète par un point quelconque.
    if (total === 0) {
      const fallback = points[centres.length % points.length]!;
      centres.push({ lat: fallback.lat, lng: fallback.lng });
      continue;
    }

    let threshold = random() * total;
    let chosen = points.length - 1;
    for (let i = 0; i < weights.length; i += 1) {
      threshold -= weights[i]!;
      if (threshold <= 0) {
        chosen = i;
        break;
      }
    }
    centres.push({ lat: points[chosen]!.lat, lng: points[chosen]!.lng });
  }

  return centres;
}

export function kmeans(points: ClusterPoint[], options: KmeansOptions): ClusteringOutcome {
  if (!Number.isInteger(options.k) || options.k < 1) {
    throw new Error("kmeans: k doit être un entier positif");
  }
  if (points.length === 0) return { clusters: [], noise: [] };

  // Plus de groupes demandés que de points : chacun est son propre groupe.
  // Renvoyer k groupes dont certains vides serait formellement conforme et
  // pratiquement inutile – la coordination verrait des secteurs fantômes.
  if (options.k >= points.length) {
    return { clusters: points.map((point) => [point.id]), noise: [] };
  }

  const random = seededRandom(seedFrom(points));
  let centres = initialCentres(points, options.k, random);
  let assignment = new Array<number>(points.length).fill(0);

  const maxIterations = options.maxIterations ?? DEFAULT_MAX_ITERATIONS;
  for (let iteration = 0; iteration < maxIterations; iteration += 1) {
    const next = points.map((point) => nearestCentre(point, centres));

    // Convergence : plus aucun point ne change de groupe.
    const stable = next.every((value, index) => value === assignment[index]);
    assignment = next;
    if (stable && iteration > 0) break;

    // Recentrage. Un groupe vide garde son centre précédent plutôt que de
    // disparaître : le supprimer en cours de route ferait varier k d'une
    // itération à l'autre et rendrait la convergence incertaine.
    centres = centres.map((centre, index) => {
      const members = points.filter((_, i) => assignment[i] === index);
      return members.length === 0 ? centre : centroid(members);
    });
  }

  const grouped: string[][] = Array.from({ length: options.k }, () => []);
  for (let i = 0; i < points.length; i += 1) grouped[assignment[i]!]!.push(points[i]!.id);

  // Les groupes restés vides sont écartés de la sortie : ils n'ont pas de
  // patient, donc pas de tournée, donc rien à montrer ni à valider.
  return { clusters: grouped.filter((cluster) => cluster.length > 0), noise: [] };
}
