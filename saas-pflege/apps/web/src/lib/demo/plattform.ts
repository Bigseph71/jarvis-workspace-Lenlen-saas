/**
 * Umsatzverlauf der Plattform.
 *
 * ────────────────────────────────────────────────────────────────────────────
 *  DIE EINZIGEN BEISPIELWERTE DIESES BILDSCHIRMS.
 * ────────────────────────────────────────────────────────────────────────────
 *
 * Anders als Übersicht und Planung ist die Plattform-Verwaltung bereits an
 * echte Daten angeschlossen: Kennzahlen, Aufschlüsselung nach Status, Umsatz,
 * Wachstum, Warnungen und die Organisationsliste kommen aus
 * `adminDashboard()` und `adminListOrganizations()`.
 *
 * Was fehlt, ist die GESCHICHTE: `adminDashboard()` liefert den Umsatz von
 * heute, nicht den der letzten sechs Monate. Für die Verlaufskurve gibt es
 * keinen Endpunkt, und einen zu erfinden hiesse, Stripe-Abrechnungsperioden
 * nachzubauen – eine eigene Aufgabe.
 *
 * Deshalb steht die Kurve unter einem eigenen, kleinen Hinweis direkt an der
 * Karte, statt den ganzen Bildschirm als Beispiel zu kennzeichnen. Der Rest
 * ist echt, und das darf man ihm ansehen.
 */

/** Punkte der Fläche im Koordinatensystem 320×96 (Handoff). */
export const REVENUE_AREA_PATH =
  "M0 82 C34 80 52 66 88 62 C124 58 140 48 176 44 C212 40 230 30 266 26 C292 23 306 18 320 16";

/** Dieselbe Kurve, unten geschlossen – trägt den Verlauf. */
export const REVENUE_AREA_FILL = `${REVENUE_AREA_PATH} L320 96 L0 96 Z`;

/**
 * Monate der Achse. Als Monatsindex (0 = Januar) und nicht als Text, damit
 * die Beschriftung der Locale folgt: "Mär" in DE, "mars" in FR.
 */
export const REVENUE_MONTHS = [2, 3, 4, 5, 6, 7];

/** Veränderung über 30 Tage. Ohne Verlauf nicht berechenbar. */
export const REVENUE_TREND_PERCENT = 9.4;
