/**
 * Reiner VRPTW-Solver-Stub (ohne DB / Seiteneffekte, voll unit-testbar).
 *
 * Phase 2: liefert eine GÜLTIGE Lösung – die Besuche werden per Nearest-Neighbor
 * ab dem ersten geplanten Besuch nach Distanz geordnet. Kein echtes VRPTW mit
 * Zeitfenstern/Arbeitszeiten – das folgt in einer späteren Iteration. Der
 * Vertrag (Signatur + Rückgabe) bleibt dabei stabil.
 *
 * Timeout: übersteigt die Konstruktion die Deadline, werden die restlichen
 * Besuche in ihrer Ursprungsreihenfolge angehängt und `partial: true` gesetzt
 * (Teil-Lösung statt Abbruch).
 */

export interface Stop {
  visitId: string;
  lat: number;
  lng: number;
}

export interface VrptwSolution {
  /** Geordnete visitId-Liste (die optimierte Reihenfolge). */
  order: string[];
  /** Gesamtstrecke in km (auf 2 Nachkommastellen gerundet). */
  totalKm: number;
  /** Qualitäts-Score 0–100 relativ zur ursprünglichen (naiven) Reihenfolge. */
  score: number;
  /** true, wenn wegen Timeout nur eine Teil-Lösung berechnet wurde. */
  partial: boolean;
}

export interface SolveOptions {
  /** Absolute Deadline (ms, wie Date.now()). Default: kein Limit. */
  deadline?: number;
  /** Zeitquelle (injizierbar für Tests). Default: Date.now. */
  now?: () => number;
}

// Die Distanzrechnung liegt in lib/geo.ts: sie war hier auf `Stop` typisiert
// und damit nur für Besuche brauchbar. Das Clustering rechnet auf Patienten.
// Der Re-Export hält bestehende Importe aus diesem Modul gültig.
import { haversineKm } from "../geo.js";

export { haversineKm };

/** Summe der aufeinanderfolgenden Distanzen einer geordneten Stopp-Liste (km). */
export function routeDistanceKm(stops: Stop[]): number {
  let total = 0;
  for (let i = 1; i < stops.length; i += 1) {
    total += haversineKm(stops[i - 1]!, stops[i]!);
  }
  return total;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Ordnet die Besuche per Nearest-Neighbor ab `stops[0]` (erster geplanter
 * Besuch = Anker). Ergebnis enthält immer ALLE eingegebenen visitIds genau
 * einmal – auch bei Timeout (Rest in Ursprungsreihenfolge angehängt).
 */
export function solveVrptw(stops: Stop[], opts: SolveOptions = {}): VrptwSolution {
  const now = opts.now ?? Date.now;
  const deadline = opts.deadline ?? Number.POSITIVE_INFINITY;

  if (stops.length <= 1) {
    return { order: stops.map((s) => s.visitId), totalKm: 0, score: 100, partial: false };
  }

  const remaining = stops.slice(1);
  const ordered: Stop[] = [stops[0]!];
  let current = stops[0]!;
  let partial = false;

  while (remaining.length > 0) {
    if (now() > deadline) {
      // Teil-Lösung: Rest in Ursprungsreihenfolge anhängen.
      partial = true;
      ordered.push(...remaining.splice(0));
      break;
    }
    let bestIdx = 0;
    let bestDist = haversineKm(current, remaining[0]!);
    for (let i = 1; i < remaining.length; i += 1) {
      const d = haversineKm(current, remaining[i]!);
      if (d < bestDist) {
        bestDist = d;
        bestIdx = i;
      }
    }
    current = remaining.splice(bestIdx, 1)[0]!;
    ordered.push(current);
  }

  const optimizedKm = routeDistanceKm(ordered);
  const naiveKm = routeDistanceKm(stops);
  // Score: Effizienz gegenüber der naiven (geplanten) Reihenfolge, gedeckelt.
  const score = optimizedKm > 0 ? clamp(Math.round((naiveKm / optimizedKm) * 100), 0, 100) : 100;

  return {
    order: ordered.map((s) => s.visitId),
    totalKm: round2(optimizedKm),
    score,
    partial,
  };
}
