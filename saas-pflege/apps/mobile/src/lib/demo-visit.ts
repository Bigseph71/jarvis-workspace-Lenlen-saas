/**
 * Inhalte des Bildschirms "Laufender Besuch", die es noch nicht gibt.
 *
 * ────────────────────────────────────────────────────────────────────────────
 *  BEISPIELINHALT. NICHT ANGEBUNDEN, NICHT BEDIENBAR.
 * ────────────────────────────────────────────────────────────────────────────
 *
 * Zwei Bausteine des Entwurfs haben im Backend kein Gegenstück:
 *
 *   Leistungen ("Actes à documenter")  – es gibt keine Leistungsliste am
 *                                        Besuch, weder Katalog noch Häkchen.
 *   Anweisung der Koordination         – es gibt keinen Kanal dafür ausser
 *                                        dem Chat.
 *
 * Beide werden deshalb NICHT bedienbar gerendert. Der Unterschied zu den
 * Beispielzahlen der Web-Bildschirme ist wichtig: eine erfundene Kennzahl auf
 * dem Schreibtisch einer Koordination ist ärgerlich, eine abhakbare
 * Leistungsliste am Krankenbett ist etwas anderes. Eine Fachkraft, die Häkchen
 * setzt und annimmt, damit sei dokumentiert, hat am Ende des Tages eine
 * Dokumentation, die nirgends existiert – und im Streitfall haftet sie dafür.
 *
 * Was hier ECHT ist und deshalb nicht in dieser Datei steht: Ankunftszeit,
 * Abweichung zum Termin, Patient, Position im Tagesablauf, das Pointage der
 * Abfahrt und die Besuchsnotiz (siehe visit-note).
 */

export type CareTaskState = "done" | "inProgress" | "todo";

export interface CareTaskFixture {
  id: "hygiene" | "dressing" | "bloodPressure" | "prescriptions";
  state: CareTaskState;
}

export const CARE_TASKS: readonly CareTaskFixture[] = [
  { id: "hygiene", state: "done" },
  { id: "dressing", state: "inProgress" },
  { id: "bloodPressure", state: "todo" },
  { id: "prescriptions", state: "todo" },
];
