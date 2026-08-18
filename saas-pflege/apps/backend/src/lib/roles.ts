import { UserRole } from "@len-len/database";

/**
 * Rollen, die planen dürfen: Besuche, Touren, Gebietsaufteilung.
 *
 * EINE Liste, von REST und WebSocket gemeinsam benutzt. Vorher stand dieselbe
 * Aufzählung dreimal im Code (visits, clustering, vrptw) und die
 * WebSocket-Handler hatten gar keine – ein Nebenweg an der Rollenprüfung
 * vorbei. Wer die Regel ändert, ändert sie hier und trifft damit beide Wege.
 */
export const PLANNING_ROLES: readonly UserRole[] = [
  UserRole.SUPER_ADMIN,
  UserRole.STRUKTUR_ADMIN,
  UserRole.KOORDINATOR,
];

/** Darf planen (Besuche, Touren, Gebiete)? Gegenstück zu requireRole im REST. */
export function canPlan(role: UserRole): boolean {
  return PLANNING_ROLES.includes(role);
}
