import { UserRole } from "@len-len/database";

/**
 * Zugriffsregeln des Trackings (rein, testbar). Ergänzt die DB-seitige
 * Tenant-Isolation (RLS) um die feinere Regel:
 *   - Koordinator / Admins: sehen die Positionen der GESAMTEN Organisation.
 *   - Fachkraft: sieht ausschließlich ihre EIGENE Position.
 *   - HR: keine Standortdaten (kein Patient-/Einsatzbezug).
 */

/** Darf organisationsweite Live-Positionen sehen (GET /tracking/live, WS)? */
export function canViewOrgLive(role: UserRole): boolean {
  return (
    role === UserRole.SUPER_ADMIN ||
    role === UserRole.STRUKTUR_ADMIN ||
    role === UserRole.KOORDINATOR
  );
}

export interface PositionScope {
  /** true = auf die eigene Fachkraft beschränkt; false = organisationsweit. */
  ownOnly: boolean;
}

/**
 * Sichtbarkeits-Scope einer Rolle. Fachkraft ist auf sich selbst beschränkt,
 * alle live-berechtigten Rollen sehen die ganze Organisation.
 */
export function positionScope(role: UserRole): PositionScope {
  return { ownOnly: !canViewOrgLive(role) };
}

export interface Recorded {
  caregiverId: string;
  recordedAt: Date | string;
}

/**
 * Reduziert einen Positionsverlauf auf die JÜNGSTE Position je Fachkraft.
 * Reihenfolge der Eingabe egal; bei Gleichstand gewinnt der spätere Eintrag.
 */
export function latestPerCaregiver<T extends Recorded>(positions: T[]): T[] {
  const latest = new Map<string, T>();
  for (const p of positions) {
    const current = latest.get(p.caregiverId);
    if (!current || new Date(p.recordedAt).getTime() >= new Date(current.recordedAt).getTime()) {
      latest.set(p.caregiverId, p);
    }
  }
  return [...latest.values()];
}
