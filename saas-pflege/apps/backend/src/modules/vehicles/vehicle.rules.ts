/**
 * Reine Geschäftslogik des Leasing-Moduls (ohne DB, voll testbar).
 * Regel 6 (CLAUDE.md): Fahrzeuge mit den wenigsten genutzten km übernehmen die
 * längsten Fahrten. Alerts nach km-Auslastung und Leasing-Restlaufzeit.
 */

/** Schwellen für Alerts (konfigurierbar an einer Stelle). */
export const WARN_RATIO = 0.8; // >= 80 % -> Warnung
export const CRIT_RATIO = 0.95; // >= 95 % -> Kritisch
export const EXPIRY_DAYS = 30; // Leasingende in < 30 Tagen -> Ablauf

export type VehicleAlert = "Warnung" | "Kritisch" | "Ablauf";
export type VehicleStatus = "OK" | VehicleAlert;

interface VehicleLeasing {
  leasingKmUsed: number;
  leasingKmLimit: number;
  leasingEndDate: Date | null;
}

/** Auslastung in Prozent (0 wenn kein sinnvolles Limit gesetzt ist). */
export function usagePercent(used: number, limit: number): number {
  if (limit <= 0) return 0;
  return (used / limit) * 100;
}

/** Ganze Tage bis zum Leasingende; negativ, wenn bereits abgelaufen. */
export function daysUntil(endDate: Date, now: Date): number {
  const DAY_MS = 24 * 60 * 60 * 1000;
  return Math.floor((endDate.getTime() - now.getTime()) / DAY_MS);
}

/**
 * Alle zutreffenden Alerts. Bei den km-Alerts verdrängt "Kritisch" die
 * "Warnung" (nur der schwerwiegendere km-Alert wird ausgegeben). "Ablauf"
 * kann zusätzlich auftreten.
 */
export function vehicleAlerts(v: VehicleLeasing, now: Date): VehicleAlert[] {
  const alerts: VehicleAlert[] = [];
  const pct = usagePercent(v.leasingKmUsed, v.leasingKmLimit);
  if (pct >= CRIT_RATIO * 100) alerts.push("Kritisch");
  else if (pct >= WARN_RATIO * 100) alerts.push("Warnung");

  if (v.leasingEndDate && daysUntil(v.leasingEndDate, now) < EXPIRY_DAYS) {
    alerts.push("Ablauf");
  }
  return alerts;
}

/** Ein einzelner Badge-Status. Priorität: Kritisch > Ablauf > Warnung > OK. */
export function vehicleStatus(v: VehicleLeasing, now: Date): VehicleStatus {
  const alerts = vehicleAlerts(v, now);
  if (alerts.includes("Kritisch")) return "Kritisch";
  if (alerts.includes("Ablauf")) return "Ablauf";
  if (alerts.includes("Warnung")) return "Warnung";
  return "OK";
}

/**
 * Regel 6: wählt für eine Fahrt der Länge `km` das Fahrzeug mit den wenigsten
 * genutzten km, das die Fahrt noch im Rahmen des Limits fahren kann. Gibt es
 * kein Fahrzeug mit ausreichender Restkapazität, wird das am wenigsten
 * genutzte Fahrzeug gewählt und `sufficientCapacity: false` gemeldet.
 * Erwartet eine bereits gefilterte Liste aktiver Fahrzeuge.
 */
export function pickVehicleForTrip<T extends VehicleLeasing & { id: string }>(
  vehicles: T[],
  km: number,
): { vehicle: T; sufficientCapacity: boolean } | null {
  if (vehicles.length === 0) return null;

  const withCapacity = vehicles.filter((v) => v.leasingKmLimit - v.leasingKmUsed >= km);
  const pool = withCapacity.length > 0 ? withCapacity : vehicles;

  // Wenigste genutzte km; deterministischer Tie-Break über die id.
  const vehicle = pool.reduce((best, v) => {
    if (v.leasingKmUsed < best.leasingKmUsed) return v;
    if (v.leasingKmUsed === best.leasingKmUsed && v.id < best.id) return v;
    return best;
  });

  return { vehicle, sufficientCapacity: withCapacity.length > 0 };
}
