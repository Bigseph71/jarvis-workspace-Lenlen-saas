/**
 * Daten des Planungsarbeitsplatzes.
 *
 * ────────────────────────────────────────────────────────────────────────────
 *  VORLÄUFIGE WERTE AUS DEM DESIGN-HANDOFF. NOCH KEINE ECHTEN DATEN.
 * ────────────────────────────────────────────────────────────────────────────
 *
 * Der ganze Bildschirm setzt eine Optimierung voraus, die es noch nicht gibt:
 * VRPTW ist Phase 2. Es existiert weder ein Entwurf mit Versionsnummer, noch
 * ein Vergleich zur manuellen Planung, noch ein Veröffentlichungsvorgang.
 *
 * Wie bei der Übersicht sind die Typen unten die Schnittstelle: der Ersatz
 * durch echte Abfragen tauscht diese Datei aus, ohne die Komponenten zu
 * berühren.
 */

/** Entwurf, auf den sich der ganze Bildschirm bezieht. */
export const DRAFT = {
  version: 3,
  /** Vergleichsstand für den Knopf "mit v2 vergleichen". */
  previousVersion: 2,
  date: new Date("2026-08-27T07:00:00.000Z"),
  tours: 11,
  minutes: 11,
};

/** Kopf der Karte. */
export const MAP_HEADER = {
  sector: "west" as const,
  overlaidTours: 3,
  geocodedPatients: 42,
};

/** Ebenen des Kartenumschalters. */
export const MAP_LAYERS = ["routes", "density", "delays"] as const;
export type MapLayer = (typeof MAP_LAYERS)[number];

/** Ausgewählte Tour – speist das Panel am unteren Rand der Karte. */
export const SELECTED_TOUR = {
  number: "04",
  caregiver: "Nadia Reinhardt",
  done: 3,
  visits: 9,
  /** Abweichung zum Plan in Minuten. Positiv = Verzug. */
  driftMinutes: 6,
  remainingKm: 6.4,
  expectedEnd: new Date("2026-08-27T10:40:00.000Z"),
};

export type GainTone = "forest" | "sageDeep" | "clayDeep";

export interface GainFixture {
  id: "kilometers" | "travelTime" | "windows" | "balanced";
  tone: GainTone;
}

/**
 * Die vier Gewinne gegenüber der manuellen Planung.
 *
 * Der vierte ist bewusst clay und nicht grün: 9 von 11 ausgeglichenen Touren
 * heisst, dass zwei es NICHT sind. Eine Bilanz, die nur ihre guten Zahlen
 * einfärbt, ist Werbung.
 */
export const GAINS: readonly GainFixture[] = [
  { id: "kilometers", tone: "forest" },
  { id: "travelTime", tone: "forest" },
  { id: "windows", tone: "sageDeep" },
  { id: "balanced", tone: "clayDeep" },
];

/**
 * Angewandte Regeln.
 *
 * Sie machen sichtbar, welche Randbedingungen der Optimierer eingehalten hat.
 * Ohne sie ist der Plan eine Blackbox – und ein Plan, dem man nicht ansieht,
 * warum er so aussieht, wird nicht befolgt.
 */
export const RULES = [
  "continuity",
  "legalBreak",
  "maxTravel",
  "qualification",
  "timeWindows",
  "preferredSector",
] as const;

/** Zusammenfassung der Veröffentlichung (Bestätigungsdialog). */
export const PUBLICATION_SUMMARY = {
  tours: 11,
  visits: 312,
  kilometers: 214,
  caregiversNotified: 11,
};

/** GPS-Anzeige in der Kopfzeile dieses Bildschirms. */
export const GPS_STATUS = { onTour: 68 };
