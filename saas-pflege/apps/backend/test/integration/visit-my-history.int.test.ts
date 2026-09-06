/**
 * Verlauf der Fachkraft (GET /visits/my-history) gegen eine ECHTE Datenbank.
 * Aktivierung wie in auth-flow.int.test.ts (RUN_DB_TESTS=1 + TEST_DATABASE_URL).
 *
 * Warum Integrationstest: der Endpunkt ist fast nur Filter und Sortierung, und
 * genau das lässt sich ohne Datenbank nicht prüfen. Was hier schiefgehen kann,
 * geht still schief - eine Fachkraft bekäme die Besuche einer Kollegin zu
 * sehen, oder ihre Liste fehlte hinten, ohne dass irgendetwas fehlschlägt.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { assertLocalTestDatabase } from "../helpers/test-database.js";

const runDbTests = process.env.RUN_DB_TESTS === "1";
const stamp = Date.now();
const adminEmail = `hist-admin+${stamp}@demo.de`;
const fk1Email = `hist-fk1+${stamp}@demo.de`;
const fk2Email = `hist-fk2+${stamp}@demo.de`;

const ALL_DAYS = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"] as const;

interface Ctx {
  organizationId: string;
  userId: string | null;
}

interface HistoryRow {
  id: string;
  scheduledAt: Date;
  gpsArrivalAt: Date | null;
  gpsDepartureAt: Date | null;
  isEmergency: boolean;
  hasIncident: boolean;
  patient: { id: string; firstName: string; lastName: string };
}

interface HistoryPage {
  data: HistoryRow[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

describe.skipIf(!runDbTests)("Verlauf der Fachkraft (DB)", () => {
  let prisma: typeof import("@len-len/database").prisma;
  let visits: typeof import("../../src/modules/visits/visit.service.js");

  let organizationId: string;
  let adminCtx: Ctx;
  let fk1Ctx: Ctx;
  let fk2Ctx: Ctx;
  /** Reihenfolge der Anlage: ältester Besuch zuerst. */
  const completedIds: string[] = [];
  let plannedId: string;
  let canceledId: string;
  let foreignId: string;

  beforeAll(async () => {
    assertLocalTestDatabase(process.env.DATABASE_URL);

    ({ prisma } = await import("@len-len/database"));
    const auth = await import("../../src/modules/auth/auth.service.js");
    const caregivers = await import("../../src/modules/caregivers/caregiver.service.js");
    const patients = await import("../../src/modules/patients/patient.service.js");
    const users = await import("../../src/modules/users/user.service.js");
    visits = await import("../../src/modules/visits/visit.service.js");

    const registered = await auth.registerOrganization({
      organizationName: "VerlaufTest GmbH",
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

    const makeFachkraft = async (
      firstName: string,
      email: string,
    ): Promise<{ caregiverId: string; ctx: Ctx }> => {
      const cg = (await caregivers.createCaregiver(adminCtx, {
        firstName,
        lastName: "Verlauf",
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

    /**
     * Je Besuch ein eigener Patient. Regel métier 1 lässt pro Patient und
     * ISO-Woche nur einen regulären Besuch zu; über Patienten zu streuen ist
     * einfacher zu lesen, als Termine über Wochen zu verteilen.
     */
    const makeVisit = async (
      lastName: string,
      caregiverId: string,
      scheduledAt: Date,
    ): Promise<string> => {
      const p = (await patients.createPatient(adminCtx, {
        firstName: "Ilse",
        lastName,
        rawAddress: "Hauptstraße 12, 69117 Heidelberg",
        assignedCaregiverId: caregiverId,
      })) as { id: string };
      const v = (await visits.createVisit(adminCtx, {
        patientId: p.id,
        scheduledAt,
      })) as { id: string };
      return v.id;
    };

    // Drei erledigte Besuche von Mara, ältester zuerst angelegt.
    const done = [
      { lastName: "Aelter", at: "2026-08-19T09:00:00.000Z" },
      { lastName: "Mitte", at: "2026-08-20T09:00:00.000Z" },
      { lastName: "Neuest", at: "2026-08-21T09:00:00.000Z" },
    ];
    for (const [index, entry] of done.entries()) {
      const id = await makeVisit(entry.lastName, fk1.caregiverId, new Date(entry.at));
      await prisma.visit.update({
        where: { id },
        data: {
          status: "COMPLETED",
          gpsArrivalAt: new Date(new Date(entry.at).getTime() + 5 * 60_000),
          // Der mittlere Besuch bleibt ohne Abfahrt: die App muss auch ohne
          // Dauer eine Zeile zeigen können (vergessenes Abfahrts-Pointage).
          gpsDepartureAt:
            index === 1 ? null : new Date(new Date(entry.at).getTime() + 45 * 60_000),
        },
      });
      completedIds.push(id);
    }

    // Was NICHT im Verlauf stehen darf.
    plannedId = await makeVisit("Geplant", fk1.caregiverId, new Date("2026-08-22T09:00:00.000Z"));
    canceledId = await makeVisit("Storno", fk1.caregiverId, new Date("2026-08-23T09:00:00.000Z"));
    await prisma.visit.update({ where: { id: canceledId }, data: { status: "CANCELED" } });

    // Ein erledigter Besuch von Jonas: er gehört in SEINEN Verlauf, nicht in Maras.
    foreignId = await makeVisit("Fremd", fk2.caregiverId, new Date("2026-08-24T09:00:00.000Z"));
    await prisma.visit.update({ where: { id: foreignId }, data: { status: "COMPLETED" } });
  });

  afterAll(async () => {
    if (!prisma) return;
    if (organizationId) await prisma.organization.delete({ where: { id: organizationId } });
    await prisma.$disconnect();
  });

  const history = async (ctx: Ctx, page = 1, limit = 20): Promise<HistoryPage> =>
    (await visits.myVisitHistory(ctx, { page, limit })) as HistoryPage;

  it("zeigt nur die ERLEDIGTEN Besuche, neueste zuerst", async () => {
    const result = await history(fk1Ctx);

    // Umgekehrte Anlagereihenfolge: der zuletzt terminierte Besuch steht oben.
    expect(result.data.map((v) => v.id)).toEqual([...completedIds].reverse());
    expect(result.total).toBe(3);
  });

  it("lässt Geplantes und Storniertes aussen vor", async () => {
    // Ein abgesagter Besuch hat nicht stattgefunden, ein geplanter steht noch
    // aus. Beides gehört in die Tagesansicht, nicht in einen Rückblick.
    const ids = (await history(fk1Ctx)).data.map((v) => v.id);

    expect(ids).not.toContain(plannedId);
    expect(ids).not.toContain(canceledId);
  });

  it("zeigt keiner Fachkraft die Besuche einer anderen", async () => {
    const mine = await history(fk1Ctx);
    const theirs = await history(fk2Ctx);

    expect(mine.data.map((v) => v.id)).not.toContain(foreignId);
    expect(theirs.data.map((v) => v.id)).toEqual([foreignId]);
    expect(theirs.total).toBe(1);
  });

  it("liefert je Zeile, was die App anzeigt: Patient, Ankunft, Abfahrt", async () => {
    const [newest] = (await history(fk1Ctx)).data;

    expect(newest!.patient.lastName).toBe("Neuest");
    expect(newest!.patient.firstName).toBe("Ilse");
    expect(newest!.gpsArrivalAt).toEqual(new Date("2026-08-21T09:05:00.000Z"));
    expect(newest!.gpsDepartureAt).toEqual(new Date("2026-08-21T09:45:00.000Z"));
  });

  it("gibt eine Zeile auch ohne Abfahrt heraus", async () => {
    // Ein vergessenes Abfahrts-Pointage darf den Besuch nicht aus dem Verlauf
    // entfernen - die Fachkraft war dort, und die App schreibt statt der Dauer
    // einen Strich (lib/history.ts).
    const row = (await history(fk1Ctx)).data.find((v) => v.id === completedIds[1]);

    expect(row).toBeDefined();
    expect(row!.gpsArrivalAt).not.toBeNull();
    expect(row!.gpsDepartureAt).toBeNull();
  });

  it("blättert mit limit und page, ohne einen Besuch zu verlieren", async () => {
    const first = await history(fk1Ctx, 1, 2);
    const second = await history(fk1Ctx, 2, 2);

    expect(first.data).toHaveLength(2);
    expect(second.data).toHaveLength(1);
    expect(first.totalPages).toBe(2);
    // Die Antwort bleibt die Hausform: `limit` steuert, `pageSize` steht drin.
    expect(first.pageSize).toBe(2);

    const ids = [...first.data, ...second.data].map((v) => v.id);
    expect(new Set(ids).size).toBe(3);
    expect(ids).toEqual([...completedIds].reverse());
  });

  it("weist ein Konto ohne Fachkraft-Profil ab, statt eine leere Liste zu liefern", async () => {
    // Sonst sähe eine falsch angelegte Kennung wie eine Fachkraft ohne Besuche
    // aus, und niemand käme auf die Idee, das Profil zu prüfen.
    await expect(history(adminCtx)).rejects.toMatchObject({ statusCode: 403 });
  });
});
