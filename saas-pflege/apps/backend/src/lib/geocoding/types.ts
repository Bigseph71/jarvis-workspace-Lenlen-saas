export interface GeocodeResult {
  latitude: number;
  longitude: number;
  /** Qualität 0..1 (aus Google location_type abgeleitet). */
  score: number;
  normalizedAddress: string;
}

export interface GeocodingProvider {
  readonly name: string;
  /** Liefert das Ergebnis oder null bei "keine Treffer" (-> INVALID). */
  geocode(address: string): Promise<GeocodeResult | null>;
}
