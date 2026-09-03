/**
 * Daten der Übersicht.
 *
 * ────────────────────────────────────────────────────────────────────────────
 *  VORLÄUFIGE WERTE AUS DEM DESIGN-HANDOFF. NOCH KEINE ECHTEN DATEN.
 * ────────────────────────────────────────────────────────────────────────────
 *
 * Was diese Oberfläche zeigt, gibt es im Backend heute überwiegend nicht:
 *
 *   Kennzahlen        kein Endpunkt (Planungsdauer, Tageskilometer)
 *   Touren            `routes` ist angelegt, aber leer – die Optimierung ist Phase 2
 *   Arbitragen        kein Begriff im Datenmodell
 *   Abwesenheiten     das HR-Modul FÜHRT sie (/absences), aber ohne den hier
 *                     gezeigten Deckungsstatus je Abwesenheit
 *   Qualifikationen   aus `caregivers` ableitbar, kein Endpunkt dafür
 *
 * Deshalb Festwerte, und deshalb an einer Stelle. Der Ersatz durch echte
 * Abfragen tauscht diese Datei gegen Hooks aus, ohne die Komponenten zu
 * berühren: die Typen unten sind die Schnittstelle.
 *
 * NAMEN UND ZAHLEN SIND ERFUNDEN. Sie stehen so im Handoff, sie sind plausibel,
 * und genau darin liegt die Gefahr: auf einem Bildschirm sind sie von echten
 * Daten nicht zu unterscheiden. Bis die Anbindung steht, weist die Oberfläche
 * mit einem Hinweisstreifen darauf hin (siehe DemoNotice auf der Seite).
 */

export type Tone = "sage" | "clay";

export interface KpiFixture {
  /** Schlüssel für Beschriftung, Einheit und Delta-Text in den Nachrichten. */
  id: "planningTime" | "kilometers" | "visits" | "delays";
  value: number;
  tone: Tone;
  /** Pfad der Sparkline, Koordinatensystem 76×34 (Handoff). */
  spark: string;
}

export const KPIS: readonly KpiFixture[] = [
  // Die Planungsdauer steht zuerst: sie IST das Produktversprechen (Stunden
  // auf Minuten). Der Handoff hält diese Position ausdrücklich fest.
  {
    id: "planningTime",
    value: 11,
    tone: "sage",
    spark: "M2 6 C14 8 18 18 30 20 C42 22 46 26 58 27 C68 28 70 29 74 29",
  },
  {
    id: "kilometers",
    value: 214,
    tone: "sage",
    spark: "M2 8 C14 10 18 20 30 18 C42 16 46 24 58 25 C68 26 70 28 74 28",
  },
  {
    id: "visits",
    value: 312,
    tone: "sage",
    spark: "M2 26 C14 24 18 14 30 15 C42 16 46 8 58 9 C68 10 70 6 74 5",
  },
  {
    id: "delays",
    value: 3,
    tone: "clay",
    spark: "M2 20 C14 22 18 12 30 14 C42 16 46 10 58 12 C68 13 70 16 74 15",
  },
];

/** Zustand einer Tour. Bestimmt Avatar-Tönung, Balken und Pastille zugleich. */
export type TourState = "enRoute" | "overloaded" | "notStarted";

export interface TourFixture {
  id: string;
  name: string;
  /** Schlüssel des Gebiets in den Nachrichten (Himmelsrichtungen). */
  sector: "west" | "north" | "centre" | "east" | "south" | "southEast";
  visits: number;
  kilometers: number;
  state: TourState;
  /** Erledigte Besuche. Bei `overloaded` steht stattdessen die Auslastung. */
  done?: number;
  /** Auslastung in Prozent, nur bei `overloaded`. */
  load?: number;
}

export const TOURS: readonly TourFixture[] = [
  { id: "t-04", name: "Nadia Reinhardt", sector: "west", visits: 9, kilometers: 24, state: "enRoute", done: 3 },
  { id: "t-07", name: "Tomas Kaminski", sector: "north", visits: 11, kilometers: 31, state: "overloaded", load: 94 },
  { id: "t-02", name: "Lea Möller", sector: "centre", visits: 8, kilometers: 17, state: "enRoute", done: 4 },
  { id: "t-09", name: "Amira Baumann", sector: "east", visits: 10, kilometers: 26, state: "enRoute", done: 2 },
  { id: "t-11", name: "Jonas Vogt", sector: "south", visits: 7, kilometers: 22, state: "notStarted" },
  { id: "t-05", name: "Marta Dietrich", sector: "southEast", visits: 6, kilometers: 19, state: "enRoute", done: 4 },
];

/** Kopfzeile der Tourenkarte. */
export const TOUR_SUMMARY = { tours: 11, kilometers: 214, refreshedSecondsAgo: 12 };

/**
 * Arbitragen.
 *
 * Der Wortlaut steht in den Nachrichten und nicht hier: er nennt zwar Namen
 * (also Daten), ist aber vom Handoff wörtlich vorgegeben und muss in drei
 * Sprachen vorliegen. Hier steht nur, WELCHE offen sind und wie sie eingefärbt
 * werden.
 */
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

export interface AbsenceFixture {
  id: string;
  name: string;
  /** Schlüssel des Grundes in den Nachrichten. */
  reason: "sickLeave" | "approvedLeave" | "training";
  /** Schlüssel des Deckungsstatus in den Nachrichten. */
  coverage: "reassigned" | "covered" | "toReplace";
  /** Zahl für den Deckungstext (übernommene bzw. offene Besuche). */
  count?: number;
}

export const ABSENCES: readonly AbsenceFixture[] = [
  { id: "a-1", name: "Petra Weiss", reason: "sickLeave", coverage: "reassigned", count: 5 },
  { id: "a-2", name: "Selim Bayram", reason: "approvedLeave", coverage: "covered" },
  { id: "a-3", name: "Ines Marx", reason: "training", coverage: "toReplace", count: 3 },
];

export interface QualificationFixture {
  id: "basicCare" | "technicalCare" | "drivingLicence" | "arabic";
  percent: number;
  /** Farbe von Wert und Balken. */
  tone: "sage" | "clay" | "clayDeep";
  /** Zahl für den Statustext (fehlende Fachkräfte bzw. betroffene Patienten). */
  count?: number;
}

export const QUALIFICATIONS: readonly QualificationFixture[] = [
  { id: "basicCare", percent: 100, tone: "sage" },
  { id: "technicalCare", percent: 88, tone: "clay", count: 1 },
  { id: "drivingLicence", percent: 100, tone: "sage" },
  { id: "arabic", percent: 72, tone: "clayDeep", count: 2 },
];

/** Datum der Kopfzeile. Fest, damit die Oberfläche zu den Festwerten passt. */
export const OVERVIEW_DATE = new Date("2026-08-26T07:00:00.000Z");

/** Name der Organisation im Sur-titre. */
export const ORGANISATION_NAME = "Pflegedienst Nord";
