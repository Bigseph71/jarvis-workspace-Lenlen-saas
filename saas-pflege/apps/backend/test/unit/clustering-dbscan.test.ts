import { describe, it, expect } from "vitest";
import { dbscan } from "../../src/lib/clustering/dbscan.js";
import type { ClusterPoint } from "../../src/lib/clustering/types.js";

/**
 * DBSCAN.
 *
 * Les points sont de vraies coordonnées de Heidelberg, choisies pour que les
 * distances soient interprétables : Handschuhsheim et Neuenheim sont deux
 * quartiers voisins du nord, Kirchheim et Rohrbach deux quartiers du sud, et
 * les deux paires sont séparées d'environ cinq kilomètres. Un test sur des
 * coordonnées inventées passerait tout aussi bien mais ne dirait rien de ce
 * que l'algorithme fera sur une vraie ville.
 */

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

/** Ziegelhausen : à l'est, isolé, à plus de 4 km de tout le reste. */
const ISOLATED: ClusterPoint = { id: "ziegelhausen", lat: 49.421, lng: 8.7473 };

function sortedClusters(clusters: string[][]): string[][] {
  return clusters.map((c) => [...c].sort()).sort((a, b) => a[0]!.localeCompare(b[0]!));
}

describe("dbscan", () => {
  it("sépare deux groupes de quartiers éloignés", () => {
    const result = dbscan([...NORTH, ...SOUTH], { epsilonKm: 2, minPoints: 2 });

    expect(result.clusters).toHaveLength(2);
    expect(sortedClusters(result.clusters)).toEqual([
      ["boxberg", "emmertsgrund", "rohrbach"],
      ["handschuhsheim", "neuenheim", "neuenheim-2"],
    ]);
    expect(result.noise).toEqual([]);
  });

  it("laisse un patient isolé en dehors des groupes au lieu de le rattacher de force", () => {
    // C'est la propriété qui justifie DBSCAN ici. K-means aurait rattaché
    // Ziegelhausen à l'un des deux secteurs, produisant une tournée qui
    // traverse la ville pour un seul patient.
    const result = dbscan([...NORTH, ...SOUTH, ISOLATED], { epsilonKm: 2, minPoints: 2 });

    expect(result.noise).toEqual(["ziegelhausen"]);
    expect(result.clusters.flat()).not.toContain("ziegelhausen");
  });

  it("fusionne tout quand le rayon dépasse la taille de la ville", () => {
    const result = dbscan([...NORTH, ...SOUTH, ISOLATED], { epsilonKm: 50, minPoints: 2 });

    expect(result.clusters).toHaveLength(1);
    expect(result.clusters[0]).toHaveLength(7);
    expect(result.noise).toEqual([]);
  });

  it("rattache un point de bordure au groupe qui l'atteint", () => {
    // Un point sous le seuil de densité n'est PAS définitivement du bruit :
    // atteint depuis un noyau, il rejoint le groupe. Sans cette règle, chaque
    // secteur perdrait ses bords.
    const border: ClusterPoint = { id: "bordure", lat: 49.4155, lng: 8.6905 };
    const result = dbscan([...NORTH, border], { epsilonKm: 0.6, minPoints: 3 });

    expect(result.noise).not.toContain("bordure");
    expect(result.clusters.some((c) => c.includes("bordure"))).toBe(true);
  });

  it("classe chaque point isolé en bruit quand aucun ne fait densité", () => {
    const result = dbscan([...NORTH, ...SOUTH], { epsilonKm: 0.05, minPoints: 2 });

    expect(result.clusters).toEqual([]);
    expect(result.noise).toHaveLength(6);
  });

  it("est déterministe : deux appels identiques donnent le même découpage", () => {
    const options = { epsilonKm: 2, minPoints: 2 };
    const first = dbscan([...NORTH, ...SOUTH, ISOLATED], options);
    const second = dbscan([...NORTH, ...SOUTH, ISOLATED], options);

    expect(second).toEqual(first);
  });

  it("accepte l'ensemble vide", () => {
    expect(dbscan([], { epsilonKm: 2, minPoints: 2 })).toEqual({ clusters: [], noise: [] });
  });

  it("refuse des paramètres qui n'ont pas de sens", () => {
    expect(() => dbscan(NORTH, { epsilonKm: 0, minPoints: 2 })).toThrow(/epsilonKm/);
    expect(() => dbscan(NORTH, { epsilonKm: 2, minPoints: 0 })).toThrow(/minPoints/);
  });
});
