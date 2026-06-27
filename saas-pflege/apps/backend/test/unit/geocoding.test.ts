import { describe, it, expect } from "vitest";
import { parseGoogleResponse } from "../../src/lib/geocoding/google.js";
import { StubGeocodingProvider } from "../../src/lib/geocoding/stub.js";

function googleOk(locationType: string) {
  return {
    status: "OK",
    results: [
      {
        formatted_address: "Hauptstr. 1, 69117 Heidelberg, Deutschland",
        geometry: { location: { lat: 49.4093, lng: 8.6946 }, location_type: locationType },
      },
    ],
  };
}

describe("parseGoogleResponse", () => {
  it("mappt location_type auf einen Score", () => {
    expect(parseGoogleResponse(googleOk("ROOFTOP"))?.score).toBe(1);
    expect(parseGoogleResponse(googleOk("GEOMETRIC_CENTER"))?.score).toBe(0.6);
    expect(parseGoogleResponse(googleOk("APPROXIMATE"))?.score).toBe(0.4);
    // unbekannter Typ -> Fallback 0.4
    expect(parseGoogleResponse(googleOk("WEIRD"))?.score).toBe(0.4);
  });

  it("extrahiert Koordinaten und normalisierte Adresse", () => {
    const result = parseGoogleResponse(googleOk("ROOFTOP"));
    expect(result?.latitude).toBe(49.4093);
    expect(result?.longitude).toBe(8.6946);
    expect(result?.normalizedAddress).toContain("Heidelberg");
  });

  it("liefert null bei ZERO_RESULTS (ungültige Adresse)", () => {
    expect(parseGoogleResponse({ status: "ZERO_RESULTS", results: [] })).toBeNull();
  });

  it("wirft bei Fehler-Status oder fehlenden Koordinaten", () => {
    expect(() => parseGoogleResponse({ status: "REQUEST_DENIED" })).toThrow();
    expect(() => parseGoogleResponse({ status: "OK", results: [] })).toThrow();
    expect(() =>
      parseGoogleResponse({ status: "OK", results: [{ geometry: { location: {} } }] }),
    ).toThrow();
  });
});

describe("StubGeocodingProvider", () => {
  const provider = new StubGeocodingProvider();

  it("liefert deterministische Pseudo-Koordinaten rund um Heidelberg", async () => {
    const a = await provider.geocode("Hauptstr. 1, Heidelberg");
    const b = await provider.geocode("Hauptstr. 1, Heidelberg");
    expect(a).not.toBeNull();
    expect(a).toEqual(b); // deterministisch
    expect(a!.latitude).toBeGreaterThan(49.2);
    expect(a!.latitude).toBeLessThan(49.6);
  });

  it("liefert null bei zu kurzer Adresse", async () => {
    expect(await provider.geocode("ab")).toBeNull();
  });
});
