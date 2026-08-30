/**
 * Vorfall-Alarme der Koordination, gegen eine ECHTE Datenbank.
 * Aktivierung wie in auth-flow.int.test.ts (RUN_DB_TESTS=1 + TEST_DATABASE_URL).
 *
 * Warum Integrationstest: die Regeln selbst sind vier Zeilen (siehe
 * incident-ack-rules.test.ts). Was hier geprüft wird, sind die Übergänge –
 * dass eine Meldung erscheint, durch die Kenntnisnahme verschwindet und beim
 * Neuschreiben der Notiz ZURÜCKKOMMT. Der letzte Fall ist der, an dem eine
 * Alarmliste still falsch wird: quittiert wurde ein Text, den es danach nicht
 * mehr gibt.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { assertLocalTestDatabase } from "../helpers/test-database.js";

const runDbTests = process.env.RUN_DB_TESTS === "1";
const stamp = Date.now();
const adminEmail = `incident-admin+${stamp}@demo.de`;
const fkEmail = `incident-fk+${stamp}@demo.de`;

const ALL_DAYS = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"] as const;

/** B liegt VOR A: die Alarmliste muss B zuerst zeigen. */
const B_AT = new Date("2026-09-01T08:00:00.000Z");
const A_AT = new Date("2026-09-02T09:00:00.000Z");
const WRITTEN_AT = new Date("2026-09-02T10:00:00.000Z");
const REWRITE_AT = new Date("2026-09-02T10:30:00.000Z");
const PLAIN_AT = new Date("2026-09-03T11:00:00.000Z");
const PLAIN_WRITTEN_AT = new Date("2026-09-03T11:40:00.000Z");

interface Ctx {
  organizationId: string;
  userId: string | null;
}

interface Incident {
  id: string;
  visitNote: string | null;
  patient: { id: string };
  caregiver: { firstName: string } | null;
}

describe.skipIf(!runDbTests)("Vorfall-Alarme (DB)", () => {
  let prisma: typeof import("@len-len/database").prisma;
  let visits: typeof import("../../src/modules/visits/visit.service.js");

  let organizationId: string;
  let adminCtx: Ctx;
  let fkCtx: Ctx;
  let caregiverId: string;
  let visitA: string;
  let visitB: string;
  let visitPlain: string;

  const list = async (): Promise<{ total: number; data: Incident[] }> =>
    (await visits.openIncidents(adminCtx, { page: 1, pageSize: 20 })) as {
      total: number;
      data: Incident[];
    };

  const ackLog = () =>
    prisma.auditLog.findMany({
      where: { organizationId, entityType: "visit_incident_ack" },
      orderBy: { createdAt: "asc" },
    });

  /** Ankunft buchen, damit eine Notiz überhaupt zulässig ist. */
  const start = async (id: string, at: Date): Promise<void> => {
    await visits.checkIn(fkCtx, id, { enforceOwnerUserId: fkCtx.userId! }, undefined);
    await prisma.visit.update({ where: { id }, data: { gpsArrivalAt: at } });
  };

  beforeAll(async () => {
    assertLocalTestDatabase(process.env.DATABASE_URL);

    ({ prisma } = await import("@len-len/database"));
    const auth = await import("../../src/modules/auth/auth.service.js");
    const caregivers = await import("../../src/modules/caregivers/caregiver.service.js");
    const patients = await import("../../src/modules/patients/patient.service.js");
    const users = await import("../../src/modules/users/user.service.js");
    visits = await import("../../src/modules/visits/visit.service.js");

    const registered = await auth.registerOrganization({
      organizationName: "VorfallTest GmbH",
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

    const cg = (await caregivers.createCaregiver(adminCtx, {
      firstName: "Rita",
      lastName: "Vorfall",
      qualification: "PFLEGEFACHKRAFT",
      contractType: "FULL_100",
      weeklyHours: 39,
      workDays: [...ALL_DAYS],
      maxPatients: 10,
      validFrom: new Date("2026-01-01T00:00:00.000Z"),
    })) as { id: string };
    caregiverId = cg.id;

    const account = await users.createFachkraftUser(adminCtx, {
      caregiverId,
      email: fkEmail,
      language: "DE",
    });
    fkCtx = { organizationId, userId: account.user.id };

    const makePatient = async (lastName: string): Promise<string> => {
      const p = (await patients.createPatient(adminCtx, {
        firstName: "Anna",
        lastName,
        rawAddress: "Hauptstraße 3, 69117 Heidelberg",
        assignedCaregiverId: caregiverId,
      })) as { id: string };
      return p.id;
    };

    const patientA = await makePatient("Alpha");
    const patientB = await makePatient("Beta");

    visitA = ((await visits.createVisit(adminCtx, { patientId: patientA, scheduledAt: A_AT })) as {
      id: string;
    }).id;
    visitB = ((await visits.createVisit(adminCtx, { patientId: patientB, scheduledAt: B_AT })) as {
      id: string;
    }).id;

    // Ein Notfall mit gewöhnlicher Notiz: er darf NIE in der Alarmliste stehen.
    // Als Notfall angelegt, weil Patient A seinen Wochenbesuch schon hat.
    visitPlain = ((await visits.createEmergencyVisit(adminCtx, {
      patientId: patientA,
      scheduledAt: PLAIN_AT,
      caregiverId,
      emergencyReason: "Sturz gemeldet",
    })) as { id: string }).id;

    await start(visitA, A_AT);
    await start(visitB, B_AT);
    await start(visitPlain, PLAIN_AT);
  });

  afterAll(async () => {
    if (!prisma) return;
    if (organizationId) await prisma.organization.delete({ where: { id: organizationId } });
    await prisma.$disconnect();
  });

  it("ohne gemeldeten Vorfall ist die Alarmliste leer", async () => {
    await visits.writeVisitNote(
      fkCtx,
      visitPlain,
      { note: "Patient wohlauf, nichts Besonderes.", hasIncident: false },
      PLAIN_WRITTEN_AT,
    );

    expect((await list()).total).toBe(0);
  });

  it("ein gemeldeter Vorfall erscheint, mit Notiztext und meldender Fachkraft", async () => {
    await visits.writeVisitNote(
      fkCtx,
      visitA,
      { note: "Blutdruck stark erhöht, Hausarzt verständigt.", hasIncident: true },
      WRITTEN_AT,
    );

    const res = await list();
    expect(res.total).toBe(1);
    expect(res.data[0]!.id).toBe(visitA);
    // Der Text muss mitkommen: eine Warnung ohne Inhalt taugt nichts.
    expect(res.data[0]!.visitNote).toBe("Blutdruck stark erhöht, Hausarzt verständigt.");
    expect(res.data[0]!.caregiver?.firstName).toBe("Rita");
  });

  it("die Liste beginnt mit dem ÄLTESTEN Vorfall", async () => {
    await visits.writeVisitNote(
      fkCtx,
      visitB,
      { note: "Wohnung stark verwahrlost.", hasIncident: true },
      WRITTEN_AT,
    );

    const res = await list();
    expect(res.total).toBe(2);
    // B liegt einen Tag vor A. Eine Arbeitsliste stellt nach vorne, was am
    // längsten liegt – nicht das Neueste.
    expect(res.data.map((d) => d.id)).toEqual([visitB, visitA]);
  });

  it("die Kenntnisnahme schliesst die Meldung und steht im Audit-Log", async () => {
    await visits.acknowledgeIncident(adminCtx, visitA);

    const res = await list();
    expect(res.total).toBe(1);
    expect(res.data.map((d) => d.id)).toEqual([visitB]);

    const row = await prisma.visit.findUniqueOrThrow({ where: { id: visitA } });
    expect(row.incidentAckAt).not.toBeNull();
    expect(row.incidentAckByUserId).toBe(adminCtx.userId);
    // hasIncident bleibt gesetzt: der Vorfall wurde zur Kenntnis genommen,
    // nicht bestritten. Der Verlauf muss ihn weiter zeigen.
    expect(row.hasIncident).toBe(true);

    const log = await ackLog();
    expect(log).toHaveLength(1);
    expect(log[0]!.action).toBe("UPDATE");
    expect(log[0]!.userId).toBe(adminCtx.userId);
  });

  it("eine zweite Kenntnisnahme ändert nichts und scheitert nicht", async () => {
    const before = await prisma.visit.findUniqueOrThrow({ where: { id: visitA } });

    await expect(visits.acknowledgeIncident(adminCtx, visitA)).resolves.toBeDefined();

    const after = await prisma.visit.findUniqueOrThrow({ where: { id: visitA } });
    // Wer den Vorfall zur Kenntnis genommen hat, ist die Person, die ZUERST da
    // war – der zweite Klick darf den Namen nicht überschreiben.
    expect(after.incidentAckAt).toEqual(before.incidentAckAt);
    expect(after.incidentAckByUserId).toBe(before.incidentAckByUserId);
    // Und er hinterlässt keinen zweiten Protokolleintrag.
    expect(await ackLog()).toHaveLength(1);
  });

  it("ein Besuch ohne gemeldeten Vorfall lässt sich nicht quittieren", async () => {
    await expect(visits.acknowledgeIncident(adminCtx, visitPlain)).rejects.toMatchObject({
      statusCode: 409,
    });
  });

  it("wird die Notiz neu geschrieben, kommt die Warnung zurück", async () => {
    // Der Kern: quittiert wurde ein TEXT. Ändert die Fachkraft ihn in ihren
    // zwei Stunden, hat die Koordination den neuen nie gesehen.
    await prisma.visit.update({ where: { id: visitA }, data: { gpsDepartureAt: WRITTEN_AT } });

    await visits.writeVisitNote(
      fkCtx,
      visitA,
      { note: "Blutdruck erhöht UND Sturz in der Nacht.", hasIncident: true },
      REWRITE_AT,
    );

    const row = await prisma.visit.findUniqueOrThrow({ where: { id: visitA } });
    expect(row.incidentAckAt).toBeNull();
    expect(row.incidentAckByUserId).toBeNull();

    const res = await list();
    expect(res.data.map((d) => d.id)).toEqual([visitB, visitA]);
  });

  it("wird der Vorfall zurückgenommen, verschwindet die Meldung", async () => {
    await visits.writeVisitNote(
      fkCtx,
      visitA,
      { note: "Verwechslung, Blutdruck war normal.", hasIncident: false },
      REWRITE_AT,
    );

    const res = await list();
    expect(res.data.map((d) => d.id)).toEqual([visitB]);
  });
});
