import type { GeoPoint } from "../geo.js";

/** Point à regrouper : une coordonnée porteuse d'une identité. */
export interface ClusterPoint extends GeoPoint {
  id: string;
}

/**
 * Résultat d'un regroupement.
 *
 * `noise` n'existe que pour DBSCAN, qui a le droit de ne PAS classer un point.
 * C'est sa principale qualité ici : un patient isolé en périphérie ne doit pas
 * être rattaché de force à un secteur dont il est à quinze kilomètres, sous
 * peine de rendre la tournée correspondante absurde. K-means, lui, classe
 * toujours tout et renvoie donc une liste vide.
 */
export interface ClusteringOutcome {
  /** Groupes d'identifiants, sans ordre garanti entre les groupes. */
  clusters: string[][];
  /** Points non classés (DBSCAN uniquement). */
  noise: string[];
}

export type ClusteringAlgorithm = "dbscan" | "kmeans";
