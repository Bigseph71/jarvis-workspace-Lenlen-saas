/**
 * Besuchsnotizen gegen eine ECHTE Datenbank.
 * Aktivierung wie in auth-flow.int.test.ts (RUN_DB_TESTS=1 + TEST_DATABASE_URL).
 *
 * Warum Integrationstest, obwohl visit-note-rules.test.ts die Regeln schon
 * abdeckt: die Regeln sagen nur, ob geschrieben werden DARF. Was hier zählt,
 * steht danach in der Datenbank – wer als Verfasser gilt, dass eine Änderung
 * als Änderung und nicht als Neuanlage protokolliert wird, und dass der Verlauf
 * einer fremden Fachkraft verschlossen bleibt. Eine Pflegedokumentation, die
 * eine Beobachtung der falschen Person zuschreibt, ist schlimmer als gar keine.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { assertLocalTestDatabase } from "../helpers/test-database.js";

const runDbTests = process.env.RUN_DB_TESTS === "1";
const stamp = Date.now();
const adminEmail = `note-admin+${stamp}@demo.de`;
const fk1Email = `note-fk1+${stamp}@demo.de`;
const fk2Email = `note-fk2+${stamp}@demo.de`;

const ALL_DAYS = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"] as const;

/** Ein Mittwoch, damit der Arbeitstag nie vom Testlauf-Datum abhängt. */
const SCHEDULED_AT = new Date("2026-09-02T09:00:00.000Z");
const ARRIVAL = new Date("2026-09-02T09:05:00.000Z");
const DEPARTURE = new Date("2026-09-02T09:45:00.000Z");
const WITHIN_WINDOW = new Date("2026-09-02T11:00:00.000Z");
const AFTER_WINDOW = new Date("2026-09-02T13:00:00.000Z");

interface Ctx {
  organizationId: string;
  userId: string | null;
}

describe.skipIf(!runDbTests)("Besuchsnotizen (DB)", () => {
  let prisma: typeof import("@len-len/database").prisma;
  let visits: typeof import("../../src/modules/visits/visit.service.js");

  let organizationId: string;
  let adminCtx: Ctx;
  let fk1Ctx: Ctx;
  let fk2Ctx: Ctx;
  let patientId: string;
  let visitId: string;

  const notes = () =>
    prisma.auditLog.findMany({
      where: { organizationId, entityType: "visit_note" },
      orderBy: { createdAt: "asc" },
    });

  beforeAll(async () => {
    assertLocalTestDatabase(process.env.DATABASE_URL);

    ({ prisma } = await import("@len-len/database"));
    const auth = await import("../../src/modules/auth/auth.service.js");
    const caregivers = await import("../../src/modules/caregivers/caregiver.service.js");
    const patients = await import("../../src/modules/patients/patient.service.js");
    const users = await import("../../src/modules/users/user.service.js");
    visits = await import("../../src/modules/visits/visit.service.js");

    const registered = await auth.registerOrganization({
      organizationName: "NotizTest GmbH",
      country: "DE",
      adminEmail,
      adminPassword: "Sehr-Sicher-123",
    });
    organizationId = registered.user.organizationId;
    // Registrierung legt den Tenant gesperrt an; hier geht es um Fachlichkeit,
    // nicht um Abrechnung.
    await prisma.organization.update({
      where: { id: organizationId },
      data: { subscriptionStatus: "ACTIVE" },
    });
    adminCtx = { organizationId, userId: registered.user.id };

    const makeFachkraft = async (
      firstName: string,
      email: string,
    ): Promise<{ caregiverId: string; ctx: Ctx }> => {
      const cg = (await caregivers.createCaregiver(adminCtx, {
        firstName,
        lastName: "Notiz",
        qualification: "PFLEGEFACHKRAFT",
        contractType: "FULL_100",
        weeklyHours: 39,
        workDays: [...ALL_DAYS],
        maxPatients: 10,
        validFrom: new Date("2026-01-01T00:00:00.000Z"),
      })) as { id: string };
      const account = await users.createFachkraftUser(adminCtx, {
        caregiverId: cg.id,
        email,
        language: "DE",
      });
      return { caregiverId: cg.id, ctx: { organizationId, userId: account.user.id } };
    };

    const fk1 = await makeFachkraft("Mara", fk1Email);
    const fk2 = await makeFachkraft("Jonas", fk2Email);
    fk1Ctx = fk1.ctx;
    fk2Ctx = fk2.ctx;

    const p = (await patients.createPatient(adminCtx, {
      firstName: "Ilse",
      lastName: "Beobachtung",
      rawAddress: "Hauptstraße 12, 69117 Heidelberg",
      assignedCaregiverId: fk1.caregiverId,
    })) as { id: string };
    patientId = p.id;

    const v = (await visits.createVisit(adminCtx, {
      patientId,
      scheduledAt: SCHEDULED_AT,
    })) as { id: string };
    visitId = v.id;
  });

  afterAll(async () => {
    if (!prisma) return;
    if (organizationId) await prisma.organization.delete({ where: { id: organizationId } });
    await prisma.$disconnect();
  });

  it("vor dem Ankunfts-Pointage wird die Notiz abgewiesen", async () => {
    await expect(
      visits.writeVisitNote(fk1Ctx, visitId, { note: "Alles ruhig", hasIncident: false }),
    ).rejects.toMatchObject({ statusCode: 409 });

    const row = await prisma.visit.findUniqueOrThrow({ where: { id: visitId } });
    expect(row.visitNote).toBeNull();
    expect(await notes()).toHaveLength(0);
  });

  it("eine fremde Fachkraft darf nicht schreiben, auch nach der Ankunft nicht", async () => {
    await visits.checkIn(fk1Ctx, visitId, { enforceOwnerUserId: fk1Ctx.userId! }, undefined);
    await prisma.visit.update({ where: { id: visitId }, data: { gpsArrivalAt: ARRIVAL } });

    // Jonas war nicht dort. Der Besuch ist begonnen, die Regeln wären erfüllt –
    // scheitern muss es an der Person, nicht am Zustand.
    await expect(
      visits.writeVisitNote(fk2Ctx, visitId, { note: "Vom Hörensagen", hasIncident: false }),
    ).rejects.toMatchObject({ statusCode: 403 });

    expect((await prisma.visit.findUniqueOrThrow({ where: { id: visitId } })).visitNote).toBeNull();
  });

  it("ein gemeldeter Vorfall ohne Text wird abgewiesen", async () => {
    await expect(
      visits.writeVisitNote(fk1Ctx, visitId, { note: "   ", hasIncident: true }),
    ).rejects.toMatchObject({ statusCode: 422 });
  });

  it("die durchführende Fachkraft schreibt die Notiz, protokolliert als CREATE", async () => {
    await visits.writeVisitNote(
      fk1Ctx,
      visitId,
      { note: "  Patientin klagte über Schwindel.  ", hasIncident: true },
      DEPARTURE,
    );

    const row = await prisma.visit.findUniqueOrThrow({ where: { id: visitId } });
    // Getrimmt gespeichert: führende Leerzeichen sind kein Inhalt.
    expect(row.visitNote).toBe("Patientin klagte über Schwindel.");
    expect(row.hasIncident).toBe(true);
    expect(row.visitNoteWrittenAt).toEqual(DEPARTURE);

    const log = await notes();
    expect(log).toHaveLength(1);
    expect(log[0]!.action).toBe("CREATE");
    expect(log[0]!.userId).toBe(fk1Ctx.userId);
    expect(log[0]!.entityId).toBe(visitId);
  });

  it("eine Änderung innerhalb von zwei Stunden wird als UPDATE protokolliert", async () => {
    await prisma.visit.update({ where: { id: visitId }, data: { gpsDepartureAt: DEPARTURE } });

    await visits.writeVisitNote(
      fk1Ctx,
      visitId,
      { note: "Schwindel nach dem Aufstehen, Hausarzt informiert.", hasIncident: true },
      WITHIN_WINDOW,
    );

    const log = await notes();
    expect(log).toHaveLength(2);
    // Der Unterschied CREATE/UPDATE ist der Kern: bei einer Pflegedokumentation
    // ist "wurde das nachträglich umgeschrieben?" die eigentliche Frage.
    expect(log[1]!.action).toBe("UPDATE");
  });

  it("nach zwei Stunden ist die Notiz festgeschrieben", async () => {
    await expect(
      visits.writeVisitNote(
        fk1Ctx,
        visitId,
        { note: "Doch nichts gewesen.", hasIncident: false },
        AFTER_WINDOW,
      ),
    ).rejects.toMatchObject({ statusCode: 409 });

    const row = await prisma.visit.findUniqueOrThrow({ where: { id: visitId } });
    expect(row.visitNote).toBe("Schwindel nach dem Aufstehen, Hausarzt informiert.");
    expect(row.hasIncident).toBe(true);
  });

  it("der Verlauf zeigt die Notiz mit der durchführenden Fachkraft", async () => {
    const result = (await visits.patientVisitNotes(adminCtx, patientId, {
      page: 1,
      pageSize: 20,
    })) as {
      total: number;
      data: {
        id: string;
        visitNote: string | null;
        hasIncident: boolean;
        caregiver: { firstName: string } | null;
      }[];
    };

    expect(result.total).toBe(1);
    expect(result.data[0]!.id).toBe(visitId);
    expect(result.data[0]!.hasIncident).toBe(true);
    // Wer geleistet hat (Regel métier 4) – bei einer Vertretung ist das nicht
    // die Stamm-Fachkraft.
    expect(result.data[0]!.caregiver?.firstName).toBe("Mara");
  });

  it("Besuche ohne Notiz erscheinen nicht im Verlauf", async () => {
    // Sonst wäre der Verlauf eine Besuchsliste mit Lücken statt einer
    // Sammlung von Beobachtungen.
    const zweiter = (await visits.createEmergencyVisit(adminCtx, {
      patientId,
      scheduledAt: new Date("2026-09-04T10:00:00.000Z"),
      emergencyReason: "Sturz gemeldet",
    })) as { id: string };

    const result = (await visits.patientVisitNotes(adminCtx, patientId, {
      page: 1,
      pageSize: 20,
    })) as { total: number; data: { id: string }[] };

    expect(result.total).toBe(1);
    expect(result.data.map((d) => d.id)).not.toContain(zweiter.id);
  });

  it("jeder Blick in den Verlauf steht als Lesezugriff im Audit-Log", async () => {
    // Es sind Angaben zur Pflege einer benannten Person, wie die Akte selbst.
    const reads = await prisma.auditLog.findMany({
      where: { organizationId, entityType: "patient_visit_notes" },
    });

    expect(reads.length).toBe(2); // die beiden Abrufe der vorigen Tests
    expect(reads.every((r) => r.action === "READ")).toBe(true);
    expect(reads.every((r) => r.entityId === patientId)).toBe(true);
    expect(reads.every((r) => r.userId === adminCtx.userId)).toBe(true);
  });
});
