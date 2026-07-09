import { describe, it, expect } from "vitest";
import {
  createVehicleSchema,
  updateVehicleSchema,
  addKmSchema,
  assignRouteQuerySchema,
} from "../../src/modules/vehicles/vehicle.schemas.js";

describe("createVehicleSchema", () => {
  it("akzeptiert ein gültiges Fahrzeug", () => {
    const parsed = createVehicleSchema.parse({
      label: "VW Caddy W-LL 123",
      leasingKmLimit: 30000,
      leasingEndDate: "2027-01-31",
    });
    expect(parsed.leasingKmLimit).toBe(30000);
    expect(parsed.leasingEndDate).toBeInstanceOf(Date);
  });

  it("erlaubt leasingEndDate null und leasingKmUsed optional", () => {
    const parsed = createVehicleSchema.parse({ label: "Bus", leasingKmLimit: 100, leasingEndDate: null });
    expect(parsed.leasingEndDate).toBeNull();
    expect(parsed.leasingKmUsed).toBeUndefined();
  });

  it("lehnt ein nicht-positives km-Limit und leeres Label ab", () => {
    expect(() => createVehicleSchema.parse({ label: "X", leasingKmLimit: 0 })).toThrow();
    expect(() => createVehicleSchema.parse({ label: "  ", leasingKmLimit: 100 })).toThrow();
  });
});

describe("updateVehicleSchema", () => {
  it("verlangt Label und Limit, Datum optional", () => {
    const parsed = updateVehicleSchema.parse({ label: "Neu", leasingKmLimit: 5000 });
    expect(parsed.label).toBe("Neu");
    expect(parsed.leasingEndDate).toBeUndefined();
  });
});

describe("addKmSchema", () => {
  it("nur positive ganze Kilometer", () => {
    expect(addKmSchema.parse({ km: 42 }).km).toBe(42);
    expect(() => addKmSchema.parse({ km: 0 })).toThrow();
    expect(() => addKmSchema.parse({ km: -5 })).toThrow();
    expect(() => addKmSchema.parse({ km: 12.5 })).toThrow();
  });
});

describe("assignRouteQuerySchema", () => {
  it("coerct den km-Query-Parameter", () => {
    expect(assignRouteQuerySchema.parse({ km: "120" }).km).toBe(120);
  });
});
