// Hinweis: importiert Schemas, die z.nativeEnum(Prisma-Enums) nutzen ->
// benötigt einen generierten Prisma-Client (`pnpm db:generate`).
import { describe, it, expect } from "vitest";
import { createPatientSchema } from "../../src/modules/patients/patient.schemas.js";
import { createCaregiverSchema } from "../../src/modules/caregivers/caregiver.schemas.js";
import {
  createVisitSchema,
  createEmergencyVisitSchema,
} from "../../src/modules/visits/visit.schemas.js";

describe("createPatientSchema", () => {
  it("verlangt Name und plausible Adresse", () => {
    expect(() =>
      createPatientSchema.parse({ firstName: "A", lastName: "B", rawAddress: "x" }),
    ).toThrow(); // Adresse zu kurz
    const ok = createPatientSchema.parse({
      firstName: "Anna",
      lastName: "Schmidt",
      rawAddress: "Hauptstr. 1, 69115 Heidelberg",
    });
    expect(ok.firstName).toBe("Anna");
  });
});

describe("createCaregiverSchema", () => {
  const base = {
    firstName: "Max",
    lastName: "Mustermann",
    qualification: "PFLEGEFACHKRAFT",
    contractType: "FULL_100",
    weeklyHours: 38.5,
    workDays: ["MON", "TUE", "WED"],
    maxPatients: 12,
  };

  it("akzeptiert einen vollständigen Vertrag", () => {
    const parsed = createCaregiverSchema.parse(base);
    expect(parsed.weeklyHours).toBe(38.5);
  });

  it("lehnt leere Arbeitstage und negative Stunden ab", () => {
    expect(() => createCaregiverSchema.parse({ ...base, workDays: [] })).toThrow();
    expect(() => createCaregiverSchema.parse({ ...base, weeklyHours: -1 })).toThrow();
  });
});

describe("visit schemas", () => {
  it("coerced scheduledAt in ein Date", () => {
    const parsed = createVisitSchema.parse({
      patientId: "11111111-1111-1111-1111-111111111111",
      scheduledAt: "2026-06-29T08:00:00Z",
    });
    expect(parsed.scheduledAt).toBeInstanceOf(Date);
  });

  it("verlangt ein Motiv beim Notfallbesuch (Regel métier 2)", () => {
    const payload = {
      patientId: "11111111-1111-1111-1111-111111111111",
      scheduledAt: "2026-06-29T08:00:00Z",
    };
    expect(() => createEmergencyVisitSchema.parse(payload)).toThrow();
    const ok = createEmergencyVisitSchema.parse({ ...payload, emergencyReason: "Sturz" });
    expect(ok.emergencyReason).toBe("Sturz");
  });
});
