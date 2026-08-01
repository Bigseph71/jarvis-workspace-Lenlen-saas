import { describe, it, expect } from "vitest";
import { AbsenceType, ContractType, ExternalSource } from "@len-len/database";
import {
  MAX_BATCH_SIZE,
  absenceItemSchema,
  contractBatchSchema,
  contractItemSchema,
  listContractsQuerySchema,
  scheduleItemSchema,
} from "../../src/modules/hr/hr.schemas.js";

const validContract = {
  caregiverId: "3f1a0f4e-1c2b-4d3e-8a9b-0c1d2e3f4a5b",
  contractType: ContractType.PART_80,
  weeklyHours: 32,
  workDays: ["MON", "TUE", "WED", "THU"],
  maxPatients: 20,
  validFrom: "2026-09-01",
};

describe("contractItemSchema", () => {
  it("normalisiert das Datum auf UTC-Mitternacht", () => {
    const parsed = contractItemSchema.parse(validContract);
    expect(parsed.validFrom.toISOString()).toBe("2026-09-01T00:00:00.000Z");
  });

  it("setzt Standardwerte: laufender Vertrag, Quelle MANUAL", () => {
    const parsed = contractItemSchema.parse(validContract);
    expect(parsed.validUntil).toBeNull();
    expect(parsed.externalSource).toBe(ExternalSource.MANUAL);
    expect(parsed.externalId).toBeUndefined();
  });

  it("weist fachlich unmögliche Daten ab, statt sie stillschweigend zu verschieben", () => {
    expect(() => contractItemSchema.parse({ ...validContract, validFrom: "2026-02-31" })).toThrow();
    expect(() => contractItemSchema.parse({ ...validContract, validFrom: "01.09.2026" })).toThrow();
  });

  it("erzwingt mindestens einen Arbeitstag", () => {
    expect(() => contractItemSchema.parse({ ...validContract, workDays: [] })).toThrow();
  });

  it("begrenzt die Wochenstunden", () => {
    expect(() => contractItemSchema.parse({ ...validContract, weeklyHours: 61 })).toThrow();
    expect(() => contractItemSchema.parse({ ...validContract, weeklyHours: 0 })).toThrow();
  });

  it("nimmt den Herkunftsschlüssel eines Konnektors an", () => {
    const parsed = contractItemSchema.parse({
      ...validContract,
      externalId: "personio-4711",
      externalSource: ExternalSource.PERSONIO,
    });
    expect(parsed.externalId).toBe("personio-4711");
    expect(parsed.externalSource).toBe(ExternalSource.PERSONIO);
  });
});

describe("contractBatchSchema", () => {
  it("dryRun ist standardmäßig aus", () => {
    const parsed = contractBatchSchema.parse({ items: [validContract] });
    expect(parsed.dryRun).toBe(false);
  });

  it("lehnt ein leeres und ein zu großes Lot ab", () => {
    expect(() => contractBatchSchema.parse({ items: [] })).toThrow();
    const tooMany = Array.from({ length: MAX_BATCH_SIZE + 1 }, () => validContract);
    expect(() => contractBatchSchema.parse({ items: tooMany })).toThrow();
  });
});

describe("scheduleItemSchema", () => {
  const validSchedule = {
    caregiverId: "3f1a0f4e-1c2b-4d3e-8a9b-0c1d2e3f4a5b",
    date: "2026-08-03",
    start: "08:00",
    end: "16:30",
  };

  it("wandelt Uhrzeiten in Minuten seit Mitternacht", () => {
    const parsed = scheduleItemSchema.parse(validSchedule);
    expect(parsed.start).toBe(480);
    expect(parsed.end).toBe(990);
    expect(parsed.breakMinutes).toBe(0);
  });

  it("weist unbrauchbare Uhrzeiten ab", () => {
    expect(() => scheduleItemSchema.parse({ ...validSchedule, start: "8:00" })).toThrow();
    expect(() => scheduleItemSchema.parse({ ...validSchedule, end: "24:00" })).toThrow();
  });
});

describe("absenceItemSchema", () => {
  it("nimmt Zeitraum und Grund an", () => {
    const parsed = absenceItemSchema.parse({
      caregiverId: "3f1a0f4e-1c2b-4d3e-8a9b-0c1d2e3f4a5b",
      type: AbsenceType.VACATION,
      startDate: "2026-08-03",
      endDate: "2026-08-14",
      reason: "Sommerurlaub",
    });
    expect(parsed.type).toBe(AbsenceType.VACATION);
    expect(parsed.endDate.toISOString()).toBe("2026-08-14T00:00:00.000Z");
  });
});

describe("listContractsQuerySchema", () => {
  it("liest updatedSince für die inkrementelle Synchronisation", () => {
    const parsed = listContractsQuerySchema.parse({ updatedSince: "2026-07-01T00:00:00.000Z" });
    expect(parsed.updatedSince?.toISOString()).toBe("2026-07-01T00:00:00.000Z");
  });

  it("behält die Standard-Paginierung", () => {
    const parsed = listContractsQuerySchema.parse({});
    expect(parsed.page).toBe(1);
    expect(parsed.pageSize).toBe(20);
  });
});
