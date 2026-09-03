/**
 * Zustand des laufenden Planungsentwurfs.
 *
 * ────────────────────────────────────────────────────────────────────────────
 *  VORLÄUFIGE WERTE AUS DEM DESIGN-HANDOFF. NOCH KEINE ECHTEN DATEN.
 * ────────────────────────────────────────────────────────────────────────────
 *
 * Die Zahl der offenen Arbitragen steht auf der Pastille des Planungspunkts in
 * der Kopfzeile. Es gibt im Backend heute weder einen Entwurf noch eine
 * Arbitrage: die VRPTW-Optimierung ist Phase 2, und das Konzept "Konflikt, den
 * der Optimierer nicht allein entscheidet" existiert in keiner Tabelle.
 *
 * Diese Datei ist bewusst die EINZIGE Stelle, die das weiss. Sobald der
 * Endpunkt steht, wird aus der Konstante ein Hook, und keine Komponente ändert
 * sich – die Kopfzeile liest schon heute nur eine Zahl.
 */

/** Offene Arbitragen des aktuellen Entwurfs (Handoff: Badge "2"). */
export const OPEN_ARBITRATIONS = 2;
