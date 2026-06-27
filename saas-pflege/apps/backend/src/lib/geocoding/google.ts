import type { GeocodeResult, GeocodingProvider } from "./types.js";

// Google location_type -> Qualitäts-Score.
const SCORE_BY_LOCATION_TYPE: Record<string, number> = {
  ROOFTOP: 1,
  RANGE_INTERPOLATED: 0.8,
  GEOMETRIC_CENTER: 0.6,
  APPROXIMATE: 0.4,
};

interface GoogleGeocodeResponse {
  status?: string;
  results?: Array<{
    formatted_address?: string;
    geometry?: {
      location?: { lat?: number; lng?: number };
      location_type?: string;
    };
  }>;
}

/**
 * Reine Transformation der Google-Antwort. Unit-testbar.
 * - ZERO_RESULTS -> null (Adresse ungültig)
 * - andere Fehler-Status -> Exception (transient/Config -> Job kann retryen)
 */
export function parseGoogleResponse(payload: unknown): GeocodeResult | null {
  const data = payload as GoogleGeocodeResponse;

  if (data.status === "ZERO_RESULTS") return null;
  if (data.status !== "OK") {
    throw new Error(`Google Geocoding fehlgeschlagen: ${data.status ?? "UNKNOWN"}`);
  }

  const first = data.results?.[0];
  const location = first?.geometry?.location;
  if (!first || !location || typeof location.lat !== "number" || typeof location.lng !== "number") {
    throw new Error("Google Geocoding: ungültige Koordinaten in der Antwort");
  }

  const locationType = first.geometry?.location_type ?? "";
  return {
    latitude: location.lat,
    longitude: location.lng,
    score: SCORE_BY_LOCATION_TYPE[locationType] ?? 0.4,
    normalizedAddress: first.formatted_address ?? "",
  };
}

export class GoogleMapsProvider implements GeocodingProvider {
  readonly name = "google";

  constructor(private readonly apiKey: string) {}

  async geocode(address: string): Promise<GeocodeResult | null> {
    const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
    url.searchParams.set("address", address);
    url.searchParams.set("key", this.apiKey);
    url.searchParams.set("region", "de");
    url.searchParams.set("language", "de");

    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Google Geocoding HTTP ${res.status}`);
    }
    return parseGoogleResponse(await res.json());
  }
}
