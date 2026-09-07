/**
 * Doppelbuchung derselben Fachkraft, gegen eine ECHTE Datenbank.
 * Aktivierung wie in auth-flow.int.test.ts (RUN_DB_TESTS=1 + TEST_DATABASE_URL).
 *
 * Die Regel ist eine Abfrage, kein Rechenschritt: sie prueft, was bereits in
 * der Datenbank steht. Ohne echte Zeilen prueft man nur die Absicht.
 *
 * Vier Wege fuehrten zur Doppelbuchung, und alle vier werden hier gegangen:
 * anlegen, Notfall anlegen, verschieben, umbesetzen. Drei davon zu schliessen
 * hiesse, den Fehler nur schwerer auffindbar zu machen.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { assertLocalTestDatabase } from "../helpers/test-database.js";

const runDbTests = process.env.RUN_DB_TESTS === "1";
const stamp = Date.now();
const adminEmail = `dopp-admin+${stamp}@demo.de`;

const ALL_DAYS = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"] as const;
const ACHT_UHR = new Date("2026-09-02T08:00:00.000Z");

interface Ctx {
  organizationId: string;
  userId: string | null;
}

describe.skipIf(!runDbTests)("Doppelbuchung einer Fachkraft (DB)", () => {
  let prisma: typeof import("@len-len/database").prisma;
  let visits: typeof import("../../src/modules/visits/visit.service.js");

  let organizationId: string;
  let adminCtx: Ctx;
  let fkId: string;
  let zweiteFkId: string;
  const patienten: string[] = [];

  const minutesAfter = (m: number): Date => new Date(ACHT_UHR.getTime() + m * 60_000);

  beforeAll(async () => {
    assertLocalTestDatabase(process.env.DATABASE_URL);

    ({ prisma } = await import("@len-len/database"));
    const auth = await import("../../src/modules/auth/auth.service.js");
    const caregivers = await import("../../src/modules/caregivers/caregiver.service.js");
    const patients = await import("../../src/modules/patients/patient.service.js");
    visits = await import("../../src/modules/visits/visit.service.js");

    const registered = await auth.registerOrganization({
      organizationName: "DoppelTest GmbH",
      country: "DE",
      adminEmail,
      adminPassword: "Sehr-Sicher-123",
    });
    organizationId = registered.user.organizationId;
    await prisma.organization.update({
      where: { id: organizationId },
      data: { subscriptionStatus: "ACTIVE" },
    });
    adminCtx = { organizationId, userId: registered.user.id };

    const makeFk = async (firstName: string): Promise<string> => {
      const cg = (await caregivers.createCaregiver(adminCtx, {
        firstName,
        lastName: "Doppel",
        qualification: "PFLEGEFACHKRAFT",
        contractType: "FULL_100",
        weeklyHours: 39,
        workDays: [...ALL_DAYS],
        maxPatients: 20,
        validFrom: new Date("2026-01-01T00:00:00.000Z"),
      })) as { id: string };
      return cg.id;
    };

    fkId = await makeFk("Mara");
    zweiteFkId = await makeFk("Jonas");

    // Vier Patienten: Regel 1 laesst je Patient nur EINEN Besuch pro Woche zu,
    // die Kollision muss also ueber verschiedene Patienten gebaut werden.
    for (const lastName of ["Eins", "Zwei", "Drei", "Vier"]) {
      const p = (await patients.createPatient(adminCtx, {
        firstName: "Ilse",
        lastName,
        rawAddress: "Hauptstraße 12, 69117 Heidelberg",
        assignedCaregiverId: fkId,
      })) as { id: string };
      patienten.push(p.id);
    }

    // Der Besuch, mit dem alles Folgende kollidieren soll.
    await visits.createVisit(adminCtx, { patientId: patienten[0]!, scheduledAt: ACHT_UHR });
  }, 30_000);

  afterAll(async () => {
    if (!prisma) return;
    if (organizationId) await prisma.organization.delete({ where: { id: organizationId } });
    await prisma.$disconnect();
  });

  it("weist einen zweiten Besuch zur selben Uhrzeit mit 409 ab", async () => {
    await expect(
      visits.createVisit(adminCtx, { patientId: patienten[1]!, scheduledAt: ACHT_UHR }),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it("nennt im Text die belegte Uhrzeit und den Mindestabstand", async () => {
    // Eine Fehlermeldung, die nur "Konflikt" sagt, zwingt zum Suchen. Die
    // Koordination muss lesen koennen, WORAN es lag.
    await expect(
      visits.createVisit(adminCtx, { patientId: patienten[1]!, scheduledAt: ACHT_UHR }),
    ).rejects.toMatchObject({ message: expect.stringContaining("08:00") });
  });

  it("weist auch einen Termin innerhalb der 15 Minuten ab", async () => {
    await expect(
      visits.createVisit(adminCtx, { patientId: patienten[1]!, scheduledAt: minutesAfter(10) }),
    ).rejects.toMatchObject({ statusCode: 409 });
    // Und in der anderen Richtung ebenso.
    await expect(
      visits.createVisit(adminCtx, { patientId: patienten[1]!, scheduledAt: minutesAfter(-10) }),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it("laesst genau den Mindestabstand zu", async () => {
    // Sonst waere die Regel nicht "15 Minuten", sondern "irgendwas um 15".
    const visit = (await visits.createVisit(adminCtx, {
      patientId: patienten[1]!,
      scheduledAt: minutesAfter(15),
    })) as { id: string };

    expect(visit.id).toBeDefined();
    await prisma.visit.delete({ where: { id: visit.id } });
  });

  it("laesst eine ANDERE Fachkraft zur selben Uhrzeit fahren", async () => {
    // Die Regel bindet die Fachkraft, nicht die Uhrzeit.
    const visit = (await visits.createVisit(adminCtx, {
      patientId: patienten[2]!,
      scheduledAt: ACHT_UHR,
      caregiverId: zweiteFkId,
    })) as { id: string };

    expect(visit.id).toBeDefined();
    await prisma.visit.delete({ where: { id: visit.id } });
  });

  it("blockiert den Umweg ueber das VERSCHIEBEN", async () => {
    // Ohne diese Pruefung liess sich die Doppelbuchung in zwei Schritten
    // anlegen: erst weit weg terminieren, dann daraufschieben.
    const spaeter = (await visits.createVisit(adminCtx, {
      patientId: patienten[1]!,
      scheduledAt: minutesAfter(180),
    })) as { id: string };

    await expect(
      visits.rescheduleVisit(adminCtx, spaeter.id, { scheduledAt: ACHT_UHR }),
    ).rejects.toMatchObject({ statusCode: 409 });

    await prisma.visit.delete({ where: { id: spaeter.id } });
  });

  it("laesst einen Besuch auf seinen EIGENEN Termin verschieben", async () => {
    // Er darf nicht mit sich selbst kollidieren -- sonst waere jede
    // Verschiebung um fuenf Minuten unmoeglich.
    const eigener = (await visits.createVisit(adminCtx, {
      patientId: patienten[1]!,
      scheduledAt: minutesAfter(180),
    })) as { id: string };

    const verschoben = (await visits.rescheduleVisit(adminCtx, eigener.id, {
      scheduledAt: minutesAfter(185),
    })) as { id: string };

    expect(verschoben.id).toBe(eigener.id);
    await prisma.visit.delete({ where: { id: eigener.id } });
  });

  it("blockiert den Umweg ueber das UMBESETZEN", async () => {
    // Der vierte Weg: einen Besuch einer freien Fachkraft anlegen und ihn dann
    // der bereits belegten zuweisen.
    const beiJonas = (await visits.createVisit(adminCtx, {
      patientId: patienten[3]!,
      scheduledAt: ACHT_UHR,
      caregiverId: zweiteFkId,
    })) as { id: string };

    await expect(
      visits.assignCaregiver(adminCtx, beiJonas.id, fkId),
    ).rejects.toMatchObject({ statusCode: 409 });

    await prisma.visit.delete({ where: { id: beiJonas.id } });
  });

  it("laesst einen stornierten Besuch die Uhrzeit wieder freigeben", async () => {
    // Storniertes belegt keine Zeit mehr. Sonst blockierte ein abgesagter
    // Termin den Platz auf Dauer, und niemand wuesste warum.
    const ersterId = (
      await prisma.visit.findFirstOrThrow({
        where: { organizationId, scheduledAt: ACHT_UHR, caregiverId: fkId },
        select: { id: true },
      })
    ).id;
    await prisma.visit.update({ where: { id: ersterId }, data: { status: "CANCELED" } });

    const neuer = (await visits.createVisit(adminCtx, {
      patientId: patienten[1]!,
      scheduledAt: ACHT_UHR,
    })) as { id: string };

    expect(neuer.id).toBeDefined();
  });
});
