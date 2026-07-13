import { describe, it, expect } from "vitest";
import {
  haversineMeters,
  evaluateGeofence,
  GEOFENCE_RADIUS_M,
  type LatLng,
} from "../../src/lib/tracking/geofence.js";

const patient: LatLng = { lat: 49.4, lng: 8.7 };

describe("haversineMeters", () => {
  it("ist 0 für identische Punkte", () => {
    expect(haversineMeters(patient, patient)).toBe(0);
  });

  it("ist symmetrisch", () => {
    const other: LatLng = { lat: 49.41, lng: 8.71 };
    expect(haversineMeters(patient, other)).toBeCloseTo(haversineMeters(other, patient), 6);
  });

  it("approximiert ~111 m für 0,001° Breitenunterschied", () => {
    const d = haversineMeters(patient, { lat: patient.lat + 0.001, lng: patient.lng });
    expect(d).toBeGreaterThan(105);
    expect(d).toBeLessThan(118);
  });
});

describe("evaluateGeofence (Regel 500 m)", () => {
  it("meldet KEINE Verletzung innerhalb des Radius", () => {
    const near: LatLng = { lat: 49.4008, lng: 8.7 }; // ~90 m
    const res = evaluateGeofence(near, patient);
    expect(res.breach).toBe(false);
    expect(res.distanceM).not.toBeNull();
    expect(res.distanceM!).toBeLessThan(GEOFENCE_RADIUS_M);
  });

  it("meldet eine Verletzung jenseits des Radius", () => {
    const far: LatLng = { lat: 49.41, lng: 8.7 }; // ~1,1 km
    const res = evaluateGeofence(far, patient);
    expect(res.breach).toBe(true);
    expect(res.distanceM!).toBeGreaterThan(GEOFENCE_RADIUS_M);
  });

  it("ohne Patienten-Koordinaten: keine Referenz, keine Verletzung", () => {
    expect(evaluateGeofence({ lat: 0, lng: 0 }, null)).toEqual({ distanceM: null, breach: false });
  });

  it("Grenzfall: exakt am Radius ist keine Verletzung (strikt größer)", () => {
    const far: LatLng = { lat: 49.41, lng: 8.7 };
    const d = haversineMeters(far, patient);
    // Radius == Distanz -> d > radius ist false.
    expect(evaluateGeofence(far, patient, d).breach).toBe(false);
    // Minimal kleinerer Radius -> Verletzung.
    expect(evaluateGeofence(far, patient, d - 0.01).breach).toBe(true);
  });
});
