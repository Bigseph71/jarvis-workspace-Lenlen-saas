import { createHash } from "node:crypto";
import type { GeocodeResult, GeocodingProvider } from "./types.js";

// Deterministischer Stub für Dev/Test ohne API-Key. Leitet Pseudo-Koordinaten
// rund um Heidelberg aus dem Adress-Hash ab. NICHT für Produktion gedacht.
export class StubGeocodingProvider implements GeocodingProvider {
  readonly name = "stub";

  async geocode(address: string): Promise<GeocodeResult | null> {
    const trimmed = address.trim();
    if (trimmed.length < 3) return null;

    const hash = createHash("sha256").update(trimmed.toLowerCase()).digest();
    const dLat = (hash[0]! / 255 - 0.5) * 0.2; // +-0.1°
    const dLng = (hash[1]! / 255 - 0.5) * 0.2;

    return {
      latitude: Number((49.3988 + dLat).toFixed(6)),
      longitude: Number((8.6724 + dLng).toFixed(6)),
      score: 0.5,
      normalizedAddress: trimmed,
    };
  }
}
