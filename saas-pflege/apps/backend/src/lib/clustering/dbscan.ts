/**
 * DBSCAN – regroupement par densité, sans dépendance externe.
 *
 * ── Pourquoi DBSCAN par défaut plutôt que k-means ────────────────────────
 * Une coordination ne sait pas à l'avance combien de secteurs sa ville
 * comporte. K-means exige ce nombre en entrée et le lui ferait deviner, puis
 * répartirait de force TOUS les patients entre les k groupes choisis. DBSCAN
 * déduit le nombre de groupes de la densité réelle des adresses, et surtout il
 * a le droit de laisser un point de côté : un patient isolé en périphérie
 * devient du « bruit » au lieu d'être agrégé à un secteur dont il est à
 * quinze kilomètres, ce qui rendrait la tournée correspondante absurde.
 *
 * ── Coût ─────────────────────────────────────────────────────────────────
 * Implémentation en O(n²) : chaque point est comparé à tous les autres. À
 * 5 000 patients (le plafond Enterprise) cela fait 12,5 millions de distances,
 * de l'ordre de quelques centaines de millisecondes. Un index spatial
 * (R-tree, grille) ferait mieux, mais ajouterait une structure à maintenir
 * pour un gain nul aux volumes réellement en jeu : le découpage se fait par
 * JOUR, et une journée compte quelques dizaines de patients, pas des milliers.
 * C'est aussi ce qui justifie de rester en Node plutôt que d'appeler le
 * microservice Python.
 *
 * ── Déterminisme ─────────────────────────────────────────────────────────
 * Aucun aléa. À entrée identique, sortie identique, y compris l'ordre des
 * groupes. Une coordination qui relance le calcul doit retrouver le même
 * découpage, sans quoi elle ne peut pas comparer deux propositions.
 */

import { haversineKm } from "../geo.js";
import type { ClusterPoint, ClusteringOutcome } from "./types.js";

export interface DbscanOptions {
  /** Rayon de voisinage, en km. */
  epsilonKm: number;
  /**
   * Nombre minimal de points (le point lui-même inclus) pour former un noyau.
   * À 1, tout point est un noyau et il n'y a plus de bruit ; à 2, un point
   * isolé reste isolé, ce qui est le comportement utile ici.
   */
  minPoints: number;
}

/** États internes du parcours. UNVISITED n'est jamais renvoyé. */
const UNVISITED = -2;
const NOISE = -1;

/**
 * Voisinage d'un point : indices des points à moins d'epsilon, lui compris.
 * Séparé pour rester lisible – c'est le seul endroit où la distance intervient.
 */
function regionQuery(points: ClusterPoint[], index: number, epsilonKm: number): number[] {
  const neighbours: number[] = [];
  const origin = points[index]!;
  for (let i = 0; i < points.length; i += 1) {
    if (haversineKm(origin, points[i]!) <= epsilonKm) neighbours.push(i);
  }
  return neighbours;
}

export function dbscan(points: ClusterPoint[], options: DbscanOptions): ClusteringOutcome {
  if (options.epsilonKm <= 0) throw new Error("dbscan: epsilonKm doit être strictement positif");
  if (options.minPoints < 1) throw new Error("dbscan: minPoints doit valoir au moins 1");
  if (points.length === 0) return { clusters: [], noise: [] };

  const labels = new Array<number>(points.length).fill(UNVISITED);
  let clusterCount = 0;

  for (let i = 0; i < points.length; i += 1) {
    if (labels[i] !== UNVISITED) continue;

    const neighbours = regionQuery(points, i, options.epsilonKm);
    if (neighbours.length < options.minPoints) {
      // Marqué bruit, PAS définitivement : un point de bordure atteint plus
      // tard depuis un noyau voisin sera réaffecté ci-dessous. Sans cette
      // nuance, DBSCAN rejetterait les bords de chaque secteur.
      labels[i] = NOISE;
      continue;
    }

    const cluster = clusterCount;
    clusterCount += 1;
    labels[i] = cluster;

    // File d'expansion. Elle grandit pendant le parcours : c'est ce qui permet
    // à un groupe de s'étendre de proche en proche au-delà du rayon initial,
    // et donc d'épouser une forme allongée – une vallée, un axe routier – là
    // où k-means ne sait produire que des cellules convexes.
    const queue = [...neighbours];
    for (let q = 0; q < queue.length; q += 1) {
      const current = queue[q]!;
      if (labels[current] === NOISE) labels[current] = cluster; // point de bordure
      if (labels[current] !== UNVISITED) continue;

      labels[current] = cluster;
      const currentNeighbours = regionQuery(points, current, options.epsilonKm);
      if (currentNeighbours.length >= options.minPoints) {
        for (const n of currentNeighbours) {
          if (labels[n] === UNVISITED || labels[n] === NOISE) queue.push(n);
        }
      }
    }
  }

  const clusters: string[][] = Array.from({ length: clusterCount }, () => []);
  const noise: string[] = [];
  for (let i = 0; i < points.length; i += 1) {
    const label = labels[i]!;
    if (label === NOISE || label === UNVISITED) noise.push(points[i]!.id);
    else clusters[label]!.push(points[i]!.id);
  }

  return { clusters, noise };
}
