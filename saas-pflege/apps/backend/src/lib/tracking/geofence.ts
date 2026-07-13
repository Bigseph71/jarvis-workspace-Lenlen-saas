/**
 * Reine Geofencing-Logik (ohne DB / Seiteneffekte, voll unit-testbar).
 *
 * Regel: löst eine Alarmierung aus, sobald sich die Fachkraft weiter als
 * GEOFENCE_RADIUS_M vom geplanten Patienten entfernt. Distanz per Haversine.
 */

/** Standard-Radius der Geofence in Metern (konfigurierbar an einer Stelle). */
export const GEOFENCE_RADIUS_M = 500;

const EARTH_RADIUS_M = 6_371_000;

export interface LatLng {
  lat: number;
  lng: number;
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/** Großkreis-Distanz zweier Punkte in Metern (Haversine). */
export function haversineMeters(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

export interface GeofenceResult {
  /** Entfernung zum Patienten in Metern (null, wenn Patient nicht verortet). */
  distanceM: number | null;
  /** true, wenn die Distanz den Radius überschreitet. */
  breach: boolean;
}

/**
 * Bewertet eine Position gegen den geplanten Patienten-Standort.
 * Ohne Patienten-Koordinaten (kein aktiver Besuch / Patient nicht geokodiert)
 * gibt es keine Referenz -> keine Verletzung.
 */
export function evaluateGeofence(
  position: LatLng,
  patient: LatLng | null,
  radiusM: number = GEOFENCE_RADIUS_M,
): GeofenceResult {
  if (!patient) return { distanceM: null, breach: false };
  const distanceM = haversineMeters(position, patient);
  return { distanceM, breach: distanceM > radiusM };
}
