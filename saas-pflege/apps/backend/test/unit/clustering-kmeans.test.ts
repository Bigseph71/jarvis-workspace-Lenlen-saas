import { describe, it, expect } from "vitest";
import { kmeans } from "../../src/lib/clustering/kmeans.js";
import type { ClusterPoint } from "../../src/lib/clustering/types.js";

/** Mêmes quartiers de Heidelberg que pour DBSCAN, pour pouvoir comparer. */
const NORTH: ClusterPoint[] = [
  { id: "handschuhsheim", lat: 49.4304, lng: 8.6772 },
  { id: "neuenheim", lat: 49.4192, lng: 8.6873 },
  { id: "neuenheim-2", lat: 49.418, lng: 8.689 },
];

const SOUTH: ClusterPoint[] = [
  { id: "rohrbach", lat: 49.3771, lng: 8.6808 },
  { id: "boxberg", lat: 49.3796, lng: 8.7014 },
  { id: "emmertsgrund", lat: 49.3722, lng: 8.6941 },
];

const ISOLATED: ClusterPoint = { id: "ziegelhausen", lat: 49.421, lng: 8.7473 };

function clusterOf(clusters: string[][], id: string): string[] | undefined {
  return clusters.find((c) => c.includes(id));
}

describe("kmeans", () => {
  it("retrouve les deux groupes quand on lui demande deux secteurs", () => {
    const result = kmeans([...NORTH, ...SOUTH], { k: 2 });

    expect(result.clusters).toHaveLength(2);
    expect(clusterOf(result.clusters, "handschuhsheim")).toEqual(
      expect.arrayContaining(["neuenheim", "neuenheim-2"]),
    );
    expect(clusterOf(result.clusters, "rohrbach")).toEqual(
      expect.arrayContaining(["boxberg", "emmertsgrund"]),
    );
  });

  it("classe TOUS les points, y compris un patient isolé", () => {
    // La contrepartie de k-means, et la raison pour laquelle DBSCAN reste le
    // défaut : Ziegelhausen atterrit dans un secteur dont il est à 4 km, sans
    // qu'aucun signal ne l'indique.
    const result = kmeans([...NORTH, ...SOUTH, ISOLATED], { k: 2 });

    expect(result.noise).toEqual([]);
    expect(result.clusters.flat()).toHaveLength(7);
    expect(clusterOf(result.clusters, "ziegelhausen")).toBeDefined();
  });

  it("respecte le nombre de secteurs demandé", () => {
    const result = kmeans([...NORTH, ...SOUTH, ISOLATED], { k: 3 });
    expect(result.clusters).toHaveLength(3);
  });

  it("est déterministe : deux appels identiques donnent le même découpage", () => {
    // Sans graine fixe, k-means++ tirerait des centres différents à chaque
    // appel et la coordination ne pourrait pas comparer deux propositions.
    const first = kmeans([...NORTH, ...SOUTH, ISOLATED], { k: 2 });
    const second = kmeans([...NORTH, ...SOUTH, ISOLATED], { k: 2 });

    expect(second).toEqual(first);
  });

  it("ne dépend pas de l'ordre des points en entrée", () => {
    const forward = kmeans([...NORTH, ...SOUTH], { k: 2 });
    const backward = kmeans([...SOUTH, ...NORTH].reverse(), { k: 2 });

    const normalise = (clusters: string[][]): string[][] =>
      clusters.map((c) => [...c].sort()).sort((a, b) => a[0]!.localeCompare(b[0]!));

    expect(normalise(backward.clusters)).toEqual(normalise(forward.clusters));
  });

  it("donne un groupe par point quand k dépasse le nombre de points", () => {
    // Renvoyer des secteurs vides serait conforme et inutile : la coordination
    // verrait des tournées fantômes sans patient.
    const result = kmeans(NORTH, { k: 10 });

    expect(result.clusters).toHaveLength(3);
    expect(result.clusters.every((c) => c.length === 1)).toBe(true);
  });

  it("accepte l'ensemble vide", () => {
    expect(kmeans([], { k: 3 })).toEqual({ clusters: [], noise: [] });
  });

  it("refuse un k qui n'a pas de sens", () => {
    expect(() => kmeans(NORTH, { k: 0 })).toThrow(/k/);
    expect(() => kmeans(NORTH, { k: 1.5 })).toThrow(/k/);
  });
});
