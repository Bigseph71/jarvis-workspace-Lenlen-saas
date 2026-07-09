import { describe, it, expect } from "vitest";
import {
  usagePercent,
  daysUntil,
  vehicleAlerts,
  vehicleStatus,
  pickVehicleForTrip,
} from "../../src/modules/vehicles/vehicle.rules.js";

const NOW = new Date(Date.UTC(2026, 6, 8)); // 2026-07-08
const inDays = (n: number) => new Date(NOW.getTime() + n * 24 * 60 * 60 * 1000);

describe("usagePercent", () => {
  it("berechnet den Prozentsatz und schützt vor Division durch 0", () => {
    expect(usagePercent(800, 1000)).toBe(80);
    expect(usagePercent(0, 1000)).toBe(0);
    expect(usagePercent(500, 0)).toBe(0);
  });
});

describe("daysUntil", () => {
  it("liefert die Tage bis zum Datum, negativ wenn vergangen", () => {
    expect(daysUntil(inDays(10), NOW)).toBe(10);
    expect(daysUntil(inDays(-3), NOW)).toBe(-3);
  });
});

describe("vehicleAlerts (Regel 6 / Leasing)", () => {
  const base = { leasingEndDate: null as Date | null };

  it("keine Alerts unter 80 % und ohne baldiges Leasingende", () => {
    expect(vehicleAlerts({ ...base, leasingKmUsed: 790, leasingKmLimit: 1000 }, NOW)).toEqual([]);
  });

  it("Warnung ab 80 %", () => {
    expect(vehicleAlerts({ ...base, leasingKmUsed: 800, leasingKmLimit: 1000 }, NOW)).toEqual([
      "Warnung",
    ]);
  });

  it("Kritisch ab 95 % (verdrängt Warnung)", () => {
    expect(vehicleAlerts({ ...base, leasingKmUsed: 960, leasingKmLimit: 1000 }, NOW)).toEqual([
      "Kritisch",
    ]);
  });

  it("Ablauf wenn Leasingende in weniger als 30 Tagen", () => {
    const alerts = vehicleAlerts(
      { leasingKmUsed: 100, leasingKmLimit: 1000, leasingEndDate: inDays(20) },
      NOW,
    );
    expect(alerts).toEqual(["Ablauf"]);
  });

  it("kombiniert km-Alert und Ablauf", () => {
    const alerts = vehicleAlerts(
      { leasingKmUsed: 980, leasingKmLimit: 1000, leasingEndDate: inDays(5) },
      NOW,
    );
    expect(alerts).toEqual(["Kritisch", "Ablauf"]);
  });

  it("kein Ablauf ab 30 Tagen Restlaufzeit", () => {
    const alerts = vehicleAlerts(
      { leasingKmUsed: 0, leasingKmLimit: 1000, leasingEndDate: inDays(30) },
      NOW,
    );
    expect(alerts).toEqual([]);
  });
});

describe("vehicleStatus (Badge-Priorität)", () => {
  it("Kritisch schlägt Ablauf schlägt Warnung schlägt OK", () => {
    expect(vehicleStatus({ leasingKmUsed: 10, leasingKmLimit: 1000, leasingEndDate: null }, NOW)).toBe(
      "OK",
    );
    expect(
      vehicleStatus({ leasingKmUsed: 850, leasingKmLimit: 1000, leasingEndDate: null }, NOW),
    ).toBe("Warnung");
    expect(
      vehicleStatus({ leasingKmUsed: 100, leasingKmLimit: 1000, leasingEndDate: inDays(3) }, NOW),
    ).toBe("Ablauf");
    expect(
      vehicleStatus({ leasingKmUsed: 990, leasingKmLimit: 1000, leasingEndDate: inDays(3) }, NOW),
    ).toBe("Kritisch");
  });
});

describe("pickVehicleForTrip (Regel 6)", () => {
  const v = (id: string, used: number, limit = 10000) => ({
    id,
    leasingKmUsed: used,
    leasingKmLimit: limit,
    leasingEndDate: null as Date | null,
  });

  it("wählt das am wenigsten genutzte Fahrzeug mit Restkapazität", () => {
    const res = pickVehicleForTrip([v("a", 5000), v("b", 2000), v("c", 8000)], 100);
    expect(res?.vehicle.id).toBe("b");
    expect(res?.sufficientCapacity).toBe(true);
  });

  it("ignoriert Fahrzeuge ohne ausreichende Restkapazität", () => {
    // b ist am wenigsten genutzt, hat aber nur 100 km Rest; a hat genug.
    const res = pickVehicleForTrip([v("a", 5000, 10000), v("b", 900, 1000)], 500);
    expect(res?.vehicle.id).toBe("a");
    expect(res?.sufficientCapacity).toBe(true);
  });

  it("fällt auf das am wenigsten genutzte Fahrzeug zurück, wenn keins genug Rest hat", () => {
    const res = pickVehicleForTrip([v("a", 950, 1000), v("b", 980, 1000)], 500);
    expect(res?.vehicle.id).toBe("a");
    expect(res?.sufficientCapacity).toBe(false);
  });

  it("null ohne Fahrzeuge", () => {
    expect(pickVehicleForTrip([], 100)).toBeNull();
  });
});
