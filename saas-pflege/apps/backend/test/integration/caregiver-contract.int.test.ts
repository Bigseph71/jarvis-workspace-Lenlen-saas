/**
 * Integrationstest des Vertragslebenszyklus einer Fachkraft, gegen eine ECHTE
 * Datenbank. Aktivierung wie in auth-flow.int.test.ts (RUN_DB_TESTS=1 +
 * TEST_DATABASE_URL auf eine migrierte Test-DB).
 *
 * Was hier hängt und in reinen Unit-Tests nicht prüfbar wäre: der Zeitstrahl
 * der Vertragsversionen entsteht erst im Zusammenspiel von Service, RLS und
 * Datenbank. Genau dort saß der Fehler, den das HR-Modul beheben sollte –
 * Momentaufnahme auf der Fachkraft ohne Vertrag dahinter.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { assertLocalTestDatabase } from "../helpers/test-database.js";

const runDbTests = process.env.RUN_DB_TESTS === "1";
const email = `contract+${Date.now()}@demo.de`;

const day = (date: Date | null): string | null => date?.toISOString().slice(0, 10) ?? null;
const today = (): string => new Date().toISOString().slice(0, 10);

describe.skipIf(!runDbTests)("Vertragslebenszyklus einer Fachkraft (DB)", () => {
  let prisma: typeof import("@len-len/database").prisma;
  let caregivers: typeof import("../../src/modules/caregivers/caregiver.service.js");
  let organizationId: string;
  let ctx: { organizationId: string; userId: string | null };
  let caregiverId: string;

  beforeAll(async () => {
    assertLocalTestDatabase(process.env.DATABASE_URL);

    ({ prisma } = await import("@len-len/database"));
    const auth = await import("../../src/modules/auth/auth.service.js");
    caregivers = await import("../../src/modules/caregivers/caregiver.service.js");

    const result = await auth.registerOrganization({
      organizationName: "VertragsTest GmbH",
      country: "DE",
      adminEmail: email,
      adminPassword: "Sehr-Sicher-123",
    });
    organizationId = result.user.organizationId;
    ctx = { organizationId, userId: result.user.id };
  });

  afterAll(async () => {
    if (!prisma) return;
    const orgId =
      organizationId ??
      (await prisma.user.findFirst({ where: { email }, select: { organizationId: true } }))
        ?.organizationId;
    if (orgId) await prisma.organization.delete({ where: { id: orgId } });
    await prisma.$disconnect();
  });

  it("das Anlegen einer Fachkraft erzeugt ihren Erstvertrag", async () => {
    const created = (await caregivers.createCaregiver(ctx, {
      firstName: "Anna",
      lastName: "Beispiel",
      qualification: "PFLEGEFACHKRAFT",
      contractType: "FULL_100",
      weeklyHours: 39,
      workDays: ["MON", "TUE", "WED", "THU", "FRI"],
      maxPatients: 20,
      validFrom: new Date("2026-01-01T00:00:00.000Z"),
    })) as { id: string };
    caregiverId = created.id;

    const contracts = await prisma.contract.findMany({ where: { caregiverId } });
    expect(contracts).toHaveLength(1);
    expect(day(contracts[0]!.validFrom)).toBe("2026-01-01");
    expect(contracts[0]!.validUntil).toBeNull();
    expect(contracts[0]!.contractType).toBe("FULL_100");
  });

  it("eine Vertragsänderung versioniert statt zu überschreiben", async () => {
    await caregivers.updateContract(ctx, caregiverId, {
      contractType: "PART_80",
      weeklyHours: 32,
      workDays: ["MON", "TUE", "WED", "THU"],
      maxPatients: 16,
      validFrom: new Date("2026-07-01T00:00:00.000Z"),
    });

    const contracts = await prisma.contract.findMany({
      where: { caregiverId },
      orderBy: { validFrom: "asc" },
    });
    expect(contracts).toHaveLength(2);
    // Der alte Vertrag endet am Vortag des neuen, nicht irgendwann.
    expect(day(contracts[0]!.validUntil)).toBe("2026-06-30");
    expect(day(contracts[1]!.validFrom)).toBe("2026-07-01");
    expect(contracts[1]!.validUntil).toBeNull();
  });

  it("die Momentaufnahme auf der Fachkraft folgt dem GELTENDEN Vertrag", async () => {
    const caregiver = await prisma.caregiver.findUniqueOrThrow({ where: { id: caregiverId } });
    // Heute (2026-08) gilt der zweite Vertrag.
    expect(caregiver.contractType).toBe("PART_80");
    expect(Number(caregiver.weeklyHours)).toBe(32);
    expect(caregiver.maxPatients).toBe(16);
  });

  it("das Deaktivieren beendet den laufenden Vertrag am Austrittstag", async () => {
    await caregivers.deactivateCaregiver(ctx, caregiverId);

    const caregiver = await prisma.caregiver.findUniqueOrThrow({ where: { id: caregiverId } });
    expect(caregiver.isActive).toBe(false);
    expect(caregiver.deactivatedAt).not.toBeNull();
    expect(day(caregiver.deactivatedAt)).toBe(today());

    const contracts = await prisma.contract.findMany({
      where: { caregiverId },
      orderBy: { validFrom: "asc" },
    });
    // Kein offener Vertrag mehr: sonst liefe die ausgetretene Fachkraft in
    // Stundenberichten und im DATEV-Export weiter mit.
    expect(contracts.every((c) => c.validUntil !== null)).toBe(true);
    expect(day(contracts[1]!.validUntil)).toBe(today());
  });

  it("eine zweite Deaktivierung schlägt fehl, statt den Vertrag erneut zu kürzen", async () => {
    await expect(caregivers.deactivateCaregiver(ctx, caregiverId)).rejects.toThrow();
  });
});
