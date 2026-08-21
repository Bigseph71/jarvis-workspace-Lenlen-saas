import { UserRole } from "@len-len/database";

/**
 * Rollen, die planen dürfen: Besuche, Touren, Gebietsaufteilung.
 *
 * EINE Liste, von REST und WebSocket gemeinsam benutzt. Vorher stand dieselbe
 * Aufzählung dreimal im Code (visits, clustering, vrptw) und die
 * WebSocket-Handler hatten gar keine – ein Nebenweg an der Rollenprüfung
 * vorbei. Wer die Regel ändert, ändert sie hier und trifft damit beide Wege.
 *
 * SUPER_ADMIN steht hier bewusst NICHT (mehr). Er betreibt die Plattform und
 * sieht keine Daten eines Tenants: Planung heisst Namen, Adressen und Besuche
 * von Patienten. Datenminimierung – wer die Software betreibt, braucht die
 * Pflegedaten nicht, also bekommt er sie nicht. Sein Zugang ist /admin.
 */
export const PLANNING_ROLES: readonly UserRole[] = [
  UserRole.STRUKTUR_ADMIN,
  UserRole.KOORDINATOR,
];

/** Darf planen (Besuche, Touren, Gebiete)? Gegenstück zu requireRole im REST. */
export function canPlan(role: UserRole): boolean {
  return PLANNING_ROLES.includes(role);
}
