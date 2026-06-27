import { env } from "../../config/env.js";
import type { GeocodingProvider } from "./types.js";
import { GoogleMapsProvider } from "./google.js";
import { StubGeocodingProvider } from "./stub.js";

let cached: GeocodingProvider | undefined;

/**
 * Liefert den konfigurierten Geocoding-Provider (gecacht). Ohne API-Key fällt
 * das System auf den Stub zurück, damit Dev/Test ohne Google laufen.
 */
export function getGeocodingProvider(): GeocodingProvider {
  if (cached) return cached;
  cached = env.GOOGLE_MAPS_API_KEY
    ? new GoogleMapsProvider(env.GOOGLE_MAPS_API_KEY)
    : new StubGeocodingProvider();
  return cached;
}

export type { GeocodingProvider, GeocodeResult } from "./types.js";
