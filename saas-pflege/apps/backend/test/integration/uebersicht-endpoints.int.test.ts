/**
 * Endpunkte der Uebersicht gegen eine ECHTE Datenbank.
 * Aktivierung wie in auth-flow.int.test.ts (RUN_DB_TESTS=1 + TEST_DATABASE_URL).
 *
 * Beide liefern ZAHLEN, die auf dem Startbildschirm der Koordination stehen.
 * Eine falsche Summe faellt dort niemandem auf -- sie sieht aus wie eine
 * richtige. Genau deshalb werden hier Aggregation und Tagesgrenze geprueft und
 * nicht nur, dass der Endpunkt antwortet.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { assertLocalTestDatabase } from "../helpers/test-database.js";

const runDbTests = process.env.RUN_DB_TESTS === "1";
const stamp = Date.now();
const adminEmail = `ueber-admin+${stamp}@demo.de`;
const fkEmail = `ueber-fk+${stamp}@demo.de`;

const ALL_DAYS = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"] as const;

/** Ein Mittwoch, damit der Arbeitstag nie vom Testlauf-Datum abhaengt. */
const TAG = new Date("2026-09-02T09:00:00.000Z");
const ANDERER_TAG = new Date("2026-09-03T09:00:00.000Z");

interface Ctx {
  organizationId: string;
  userId: string | null;
}

interface Summary {
  date: string;
  total: number;
  planned: number;
  inProgress: number;
  completed: number;
  missed: number;
  canceled: number;
  emergencies: number;
  delayed: number;
  delayThresholdMinutes: number;
}

interface RouteDay {
  date: string;
  totals: { routes: number; optimized: number; totalKm: number };
  data: { id: string; totalKm: number | null; visitCount: number; optimized: boolean }[];
  total: number;
  totalPages: number;
  pageSize: number;
}

describe.skipIf(!runDbTests)("Endpunkte der Uebersicht (DB)", () => {
  let prisma: typeof import("@len-len/database").prisma;
  let visits: typeof import("../../src/modules/visits/visit.service.js");
  let vrptw: typeof import("../../src/modules/vrptw/vrptw.service.js");

  let organizationId: string;
  let adminCtx: Ctx;
  let caregiverId: string;

  beforeAll(async () => {
    assertLocalTestDatabase(process.env.DATABASE_URL);

    ({ prisma } = await import("@len-len/database"));
    const auth = await import("../../src/modules/auth/auth.service.js");
    const caregivers = await import("../../src/modules/caregivers/caregiver.service.js");
    const patients = await import("../../src/modules/patients/patient.service.js");
    const users = await import("../../src/modules/users/user.service.js");
    visits = await import("../../src/modules/visits/visit.service.js");
    vrptw = await import("../../src/modules/vrptw/vrptw.service.js");

    const registered = await auth.registerOrganization({
      organizationName: "UebersichtTest GmbH",
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
      firstName: "Mara",
      lastName: "Uebersicht",
      qualification: "PFLEGEFACHKRAFT",
      contractType: "FULL_100",
      weeklyHours: 39,
      workDays: [...ALL_DAYS],
      maxPatients: 20,
      validFrom: new Date("2026-01-01T00:00:00.000Z"),
    })) as { id: string };
    caregiverId = cg.id;
    await users.createFachkraftUser(adminCtx, { caregiverId, email: fkEmail, language: "DE" });

    const makeVisit = async (lastName: string, at: Date): Promise<string> => {
      const p = (await patients.createPatient(adminCtx, {
        firstName: "Ilse",
        lastName,
        rawAddress: "Hauptstraße 12, 69117 Heidelberg",
        assignedCaregiverId: caregiverId,
      })) as { id: string };
      const v = (await visits.createVisit(adminCtx, { patientId: p.id, scheduledAt: at })) as {
        id: string;
      };
      return v.id;
    };

    /*
     * Fuenf Besuche am Testtag, jeweils eine halbe Stunde auseinander.
     *
     * Frueher lagen sie alle auf DERSELBEN Minute -- was das System damals
     * zuliess und was der Doppelbuchungs-Schutz jetzt zurecht mit 409 abweist.
     * Eine Tour, auf der eine Fachkraft fuenf Patienten gleichzeitig besucht,
     * war ohnehin keine Tour: die Fixture bildete einen Fehler ab, kein
     * Arbeitsleben.
     *
     * Die Ankunftszeiten haengen deshalb am EIGENEN Termin jedes Besuchs und
     * nicht mehr an einer gemeinsamen Uhrzeit -- die geprueften Abweichungen
     * (2, 40 und 25 Minuten) bleiben damit unveraendert.
     */
    const slot = (index: number): Date => new Date(TAG.getTime() + index * 30 * 60_000);

    const erledigtPuenktlich = await makeVisit("Puenktlich", slot(0));
    await prisma.visit.update({
      where: { id: erledigtPuenktlich },
      // Zwei Minuten spaeter: das uebliche Rauschen, KEINE Verspaetung.
      data: { status: "COMPLETED", gpsArrivalAt: new Date(slot(0).getTime() + 2 * 60_000) },
    });

    const erledigtVerspaetet = await makeVisit("Verspaetet", slot(1));
    await prisma.visit.update({
      where: { id: erledigtVerspaetet },
      data: { status: "COMPLETED", gpsArrivalAt: new Date(slot(1).getTime() + 40 * 60_000) },
    });

    const laufend = await makeVisit("Laufend", slot(2));
    await prisma.visit.update({
      where: { id: laufend },
      // Ebenfalls verspaetet: der Zustand aendert daran nichts.
      data: { status: "IN_PROGRESS", gpsArrivalAt: new Date(slot(2).getTime() + 25 * 60_000) },
    });

    await makeVisit("Geplant", slot(3)); // ohne Pointage

    const storniert = await makeVisit("Storniert", slot(4));
    await prisma.visit.update({ where: { id: storniert }, data: { status: "CANCELED" } });

    // Ein Besuch am Folgetag: er darf in keiner Zahl des Testtags auftauchen.
    await makeVisit("Folgetag", ANDERER_TAG);

    // Zwei Touren am Testtag, eine am Folgetag.
    await prisma.route.createMany({
      data: [
        { organizationId, caregiverId, date: new Date("2026-09-02"), totalKm: 24.5, optimized: true },
        { organizationId, caregiverId, date: new Date("2026-09-02"), totalKm: 17.25, optimized: false },
        { organizationId, caregiverId, date: new Date("2026-09-03"), totalKm: 99, optimized: true },
      ],
    });
  }, 30_000);

  afterAll(async () => {
    if (!prisma) return;
    if (organizationId) await prisma.organization.delete({ where: { id: organizationId } });
    await prisma.$disconnect();
  });

  const summary = async (): Promise<Summary> =>
    (await visits.dailyVisitSummary(adminCtx, TAG)) as Summary;

  const routeDay = async (page = 1, pageSize = 100): Promise<RouteDay> =>
    (await vrptw.listRoutesForDay(adminCtx, { date: TAG, page, pageSize })) as RouteDay;

  it("zaehlt die Zustaende des Tages einzeln", async () => {
    const s = await summary();

    expect(s.completed).toBe(2);
    expect(s.inProgress).toBe(1);
    expect(s.planned).toBe(1);
    expect(s.canceled).toBe(1);
    expect(s.missed).toBe(0);
  });

  it("laesst Storniertes aus der Tagesmenge heraus", async () => {
    // Ein abgesagter Besuch findet nicht statt. Ihn mitzuzaehlen liesse den
    // Tag voller aussehen, als er ist -- auf einem Startbildschirm genau die
    // Zahl, nach der jemand seine Vertretungen plant.
    const s = await summary();

    expect(s.total).toBe(4);
    expect(s.total + s.canceled).toBe(5);
  });

  it("zaehlt als verspaetet nur, was die Schwelle ueberschreitet", async () => {
    // Zwei Minuten sind das uebliche Rauschen, 25 und 40 Minuten nicht.
    const s = await summary();

    expect(s.delayed).toBe(2);
    expect(s.delayThresholdMinutes).toBe(15);
  });

  it("nimmt keinen Besuch eines anderen Tages mit", async () => {
    // Die Tagesgrenze ist der Kern dieses Endpunkts: verrutscht sie, ist jede
    // Zahl darauf falsch, ohne dass es jemand bemerkt.
    const s = await summary();

    expect(s.total).toBe(4);
  });

  it("summiert die Kilometer ueber den GANZEN Tag", async () => {
    const day = await routeDay();

    expect(day.totals.routes).toBe(2);
    expect(day.totals.optimized).toBe(1);
    // 24,5 + 17,25 = 41,75 -> auf 100 Meter gerundet.
    expect(day.totals.totalKm).toBe(41.8);
  });

  it("laesst die Touren eines anderen Tages aussen vor", async () => {
    const day = await routeDay();

    expect(day.total).toBe(2);
    expect(day.data).toHaveLength(2);
    expect(day.data.some((route) => route.totalKm === 99)).toBe(false);
  });

  it("haelt die Kilometer-Summe beim Blaettern stabil", async () => {
    // Der Kern der Bauart: die Kennzahl kommt aus einer Aggregation ueber den
    // Tag, nicht aus der gelieferten Seite. Sonst waeche sie mit der
    // Seitengroesse -- und niemand saehe es der Zahl an.
    const ersteSeite = await routeDay(1, 1);

    expect(ersteSeite.data).toHaveLength(1);
    expect(ersteSeite.totalPages).toBe(2);
    expect(ersteSeite.totals.totalKm).toBe(41.8);
    expect(ersteSeite.totals.routes).toBe(2);
  });

  it("gibt je Tour die Zahl ihrer Besuche mit", async () => {
    // Ohne sie muesste die Uebersicht je Tour eine zweite Abfrage stellen.
    const day = await routeDay();

    expect(day.data.every((route) => typeof route.visitCount === "number")).toBe(true);
  });
});
