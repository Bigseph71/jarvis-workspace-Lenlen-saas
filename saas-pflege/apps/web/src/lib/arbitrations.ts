"use client";

import { useCallback, useState } from "react";
import { ARBITRATIONS, type ArbitrationFixture, type ArbitrationId } from "@/lib/demo/uebersicht";

/** Dauer des Ausblendens einer entschiedenen Karte (Handoff § Arbitrages). */
export const DISMISS_MS = 200;

export interface ArbitrationQueue {
  /** Noch offene Arbitragen, in der Reihenfolge des Entwurfs. */
  open: ArbitrationFixture[];
  /** Gerade ausblendend – trägt den Übergang, ist aber noch in `open`. */
  leaving: ArbitrationId | null;
  decide: (id: ArbitrationId) => void;
  /**
   * Sperrt eine Qualifikations-Arbitrage die Veröffentlichung?
   *
   * Ja, und nur diese. Eine fehlende Qualifikation ist ein REGULATORISCHES
   * Risiko (Regel métier 4: die Vertretung braucht dieselbe Qualifikation),
   * kein Abwägen. Ein verletztes Zeitfenster ist unangenehm, aber erlaubt –
   * es darf den Plan deshalb nicht aufhalten.
   */
  blocksPublication: boolean;
}

/**
 * Zustand der Arbitragen eines Entwurfs.
 *
 * Als Hook und nicht in der Karte, weil ZWEI Stellen ihn brauchen: die Karte
 * zeigt sie, und der Knopf "An die Fachkräfte veröffentlichen" darf nicht
 * gedrückt werden können, solange eine Qualifikations-Arbitrage offen ist.
 * Lägen beide Zustände getrennt, könnte der Knopf freigeben, was die Liste
 * noch als offen führt.
 */
export function useArbitrationQueue(): ArbitrationQueue {
  const [leaving, setLeaving] = useState<ArbitrationId | null>(null);
  const [dismissed, setDismissed] = useState<ArbitrationId[]>([]);

  const decide = useCallback((id: ArbitrationId) => {
    setLeaving(id);
    // Erst nach dem Ausblenden aus der Liste nehmen, sonst springt die Karte
    // weg statt zu verschwinden. Unter `prefers-reduced-motion` läuft der
    // Übergang praktisch mit Dauer 0 (globals.css), das Verhalten bleibt gleich.
    window.setTimeout(() => {
      setDismissed((prev) => (prev.includes(id) ? prev : [...prev, id]));
      setLeaving(null);
    }, DISMISS_MS);
  }, []);

  const open = ARBITRATIONS.filter((a) => !dismissed.includes(a.id));

  return {
    open,
    leaving,
    decide,
    blocksPublication: open.some((a) => a.id === "qualification"),
  };
}
