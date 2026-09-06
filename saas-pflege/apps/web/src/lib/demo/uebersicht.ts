/**
 * Was auf der Übersicht NOCH ein Beispielwert ist.
 *
 * ────────────────────────────────────────────────────────────────────────────
 *  Diese Datei ist auf ihren Rest geschrumpft. Der Bildschirm holt seine
 *  Zahlen inzwischen aus lib/overview/use-overview.ts.
 * ────────────────────────────────────────────────────────────────────────────
 *
 * Verschwunden sind: Kennzahlen zu Besuchen, Verspätungen und Kilometern
 * (GET /visits/daily-summary, GET /routes), die Tourenliste, die
 * Abwesenheiten (GET /hr/absences), die Qualifikationen (aus GET /caregivers)
 * sowie Datum und Organisationsname der Kopfzeile.
 *
 * Geblieben sind zwei Dinge, und beiden fehlt nicht ein FELD, sondern der
 * Vorgang dahinter:
 *
 *   Planungsdauer   niemand misst, wie lange eine Planung dauert. Es gibt
 *                   keinen Anfang und kein Ende, die man messen könnte, weil
 *                   die Planung kein Vorgang mit Zustand ist.
 *   Arbitragen      "Arbitrage" ist kein Begriff des Datenmodells. Sie setzen
 *                   einen Entwurf voraus, in dem der Optimierer offene Punkte
 *                   hinterlässt – siehe die Dette in CLAUDE.md
 *                   (clustering_sessions, Phase 2). Ihre Werte liegen in
 *                   lib/arbitrations.ts und in den Nachrichten.
 *
 * NAMEN UND ZAHLEN SIND ERFUNDEN. Beide Stellen tragen deshalb eine sichtbare
 * Marke in der Oberfläche, nicht bloss einen Kommentar hier: auf einem
 * Bildschirm ist ein plausibler Wert von einer Messung nicht zu unterscheiden,
 * und in der Pflege disponiert jemand danach.
 */

/**
 * Kennzahl "Planungsdauer".
 *
 * Die Sparkline ist der Grund, warum diese Karte als einzige noch eine hat:
 * eine Kurve ist ein VERLAUF, und einen Verlauf führt das Backend nirgends –
 * auch nicht für die angebundenen Kennzahlen. Wo eine Kurve steht, steht
 * deshalb auch die Marke.
 */
export const PLANNING_TIME_DEMO = {
  value: 11,
  spark: "M2 6 C14 8 18 18 30 20 C42 22 46 26 58 27 C68 28 70 29 74 29",
} as const;

/** Farbton einer Kennzahlenkarte. */
export type Tone = "sage" | "clay";

export type ArbitrationId = "qualification" | "timeWindow";

export interface ArbitrationFixture {
  id: ArbitrationId;
  /** Farbe der Kategorie-Beschriftung. */
  tone: "clay" | "clayDeep";
}

export const ARBITRATIONS: readonly ArbitrationFixture[] = [
  { id: "qualification", tone: "clay" },
  { id: "timeWindow", tone: "clayDeep" },
];
