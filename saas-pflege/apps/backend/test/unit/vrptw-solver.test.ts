import { describe, it, expect } from "vitest";
import {
  haversineKm,
  routeDistanceKm,
  solveVrptw,
  type Stop,
} from "../../src/lib/vrptw/solver.js";

describe("haversineKm", () => {
  it("ist 0 für identische Punkte und symmetrisch", () => {
    const a: Stop = { visitId: "a", lat: 49.4, lng: 8.7 };
    const b: Stop = { visitId: "b", lat: 49.5, lng: 8.8 };
    expect(haversineKm(a, a)).toBe(0);
    expect(haversineKm(a, b)).toBeCloseTo(haversineKm(b, a), 10);
  });

  it("approximiert eine bekannte Distanz (Heidelberg -> Mannheim ~ 18 km)", () => {
    const hd: Stop = { visitId: "hd", lat: 49.3988, lng: 8.6724 };
    const ma: Stop = { visitId: "ma", lat: 49.4875, lng: 8.466 };
    expect(haversineKm(hd, ma)).toBeGreaterThan(15);
    expect(haversineKm(hd, ma)).toBeLessThan(20);
  });
});

describe("routeDistanceKm", () => {
  it("summiert aufeinanderfolgende Distanzen; 0 bei <=1 Stopp", () => {
    expect(routeDistanceKm([])).toBe(0);
    expect(routeDistanceKm([{ visitId: "a", lat: 0, lng: 0 }])).toBe(0);
    const stops: Stop[] = [
      { visitId: "a", lat: 0, lng: 0 },
      { visitId: "b", lat: 0, lng: 1 },
      { visitId: "c", lat: 0, lng: 2 },
    ];
    const total = routeDistanceKm(stops);
    expect(total).toBeCloseTo(haversineKm(stops[0]!, stops[1]!) + haversineKm(stops[1]!, stops[2]!), 6);
  });
});

describe("solveVrptw", () => {
  it("gibt für 0/1 Stopp eine triviale Lösung zurück", () => {
    expect(solveVrptw([])).toEqual({ order: [], totalKm: 0, score: 100, partial: false });
    const one = solveVrptw([{ visitId: "x", lat: 1, lng: 1 }]);
    expect(one).toEqual({ order: ["x"], totalKm: 0, score: 100, partial: false });
  });

  it("ordnet per Nearest-Neighbor ab dem ersten Stopp und behält alle IDs genau einmal", () => {
    // Anker a bei 0; c ist näher an a als b -> Reihenfolge a, c, b, d.
    const stops: Stop[] = [
      { visitId: "a", lat: 0, lng: 0 },
      { visitId: "b", lat: 0, lng: 3 },
      { visitId: "c", lat: 0, lng: 1 },
      { visitId: "d", lat: 0, lng: 4 },
    ];
    const sol = solveVrptw(stops);
    expect(sol.order).toEqual(["a", "c", "b", "d"]);
    expect(new Set(sol.order)).toEqual(new Set(["a", "b", "c", "d"]));
    expect(sol.partial).toBe(false);
  });

  it("verbessert (oder hält) die naive Reihenfolge -> Score 0..100", () => {
    const stops: Stop[] = [
      { visitId: "a", lat: 0, lng: 0 },
      { visitId: "b", lat: 0, lng: 3 },
      { visitId: "c", lat: 0, lng: 1 },
      { visitId: "d", lat: 0, lng: 4 },
    ];
    const sol = solveVrptw(stops);
    expect(sol.score).toBeGreaterThanOrEqual(0);
    expect(sol.score).toBeLessThanOrEqual(100);
    // Optimiert ist nie länger als die naive Reihenfolge -> Score >= 100 gedeckelt.
    expect(sol.score).toBe(100);
    expect(sol.totalKm).toBeGreaterThan(0);
  });

  it("liefert bei überschrittener Deadline eine vollständige Teil-Lösung (partial=true)", () => {
    const stops: Stop[] = [
      { visitId: "a", lat: 0, lng: 0 },
      { visitId: "b", lat: 0, lng: 3 },
      { visitId: "c", lat: 0, lng: 1 },
    ];
    // Deadline bereits abgelaufen -> Rest in Ursprungsreihenfolge angehängt.
    const sol = solveVrptw(stops, { now: () => 1000, deadline: 0 });
    expect(sol.partial).toBe(true);
    expect(sol.order).toEqual(["a", "b", "c"]);
    expect(new Set(sol.order)).toEqual(new Set(["a", "b", "c"]));
  });
});
