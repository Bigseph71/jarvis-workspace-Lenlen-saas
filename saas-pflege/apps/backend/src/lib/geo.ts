/**
 * Géométrie sphérique partagée.
 *
 * Extraite du solveur VRPTW, où la distance était typée sur `Stop` et donc
 * inutilisable ailleurs sans traîner un `visitId` qui n'a rien à faire dans un
 * calcul de distance. Le clustering en a besoin sur des patients, pas sur des
 * visites : plutôt que d'en recopier une seconde version vouée à diverger, le
 * calcul s'exprime ici sur le minimum dont il dépend, deux coordonnées.
 */

export interface GeoPoint {
  lat: number;
  lng: number;
}

const EARTH_RADIUS_KM = 6371;

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/** Distance orthodromique entre deux points, en km (Haversine). */
export function haversineKm(a: GeoPoint, b: GeoPoint): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Centroïde d'un ensemble de points.
 *
 * Moyenne arithmétique des latitudes et longitudes, pas un barycentre
 * sphérique. À l'échelle d'une agglomération l'écart se compte en mètres,
 * tandis qu'un barycentre sphérique introduirait une discontinuité à
 * l'antiméridien pour aucun gain : une structure de soins ambulatoires opère
 * sur une ville, jamais à cheval sur la ligne de changement de date.
 */
export function centroid(points: GeoPoint[]): GeoPoint {
  if (points.length === 0) throw new Error("centroid: ensemble vide");
  let lat = 0;
  let lng = 0;
  for (const point of points) {
    lat += point.lat;
    lng += point.lng;
  }
  return { lat: lat / points.length, lng: lng / points.length };
}

/** Distance maximale entre deux points d'un ensemble (diamètre), en km. */
export function maxPairwiseKm(points: GeoPoint[]): number {
  let max = 0;
  for (let i = 0; i < points.length; i += 1) {
    for (let j = i + 1; j < points.length; j += 1) {
      const d = haversineKm(points[i]!, points[j]!);
      if (d > max) max = d;
    }
  }
  return max;
}
