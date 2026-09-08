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
  data: {
    id: string;
    totalKm: number | null;
    visitCount: number;
    optimized: boolean;
    staffingIssueCount: number;
  }[];
  total: number;
  totalPages: number;
  pageSize: number;
}

interface StaffingIssue {
  visitId: string;
  patientName: string;
  reason: "absence" | "off_day" | "qualification";
  absenceType?: string;
  weekday?: string;
  actualQualification?: string;
  requiredQualification?: string;
}

interface Staffing {
  checked: boolean;
  issues: StaffingIssue[];
}

describe.skipIf(!runDbTests)("Endpunkte der Uebersicht (DB)", () => {
  let prisma: typeof import("@len-len/database").prisma;
  let visits: typeof import("../../src/modules/visits/visit.service.js");
  let vrptw: typeof import("../../src/modules/vrptw/vrptw.service.js");

  let organizationId: string;
  let adminCtx: Ctx;
  let caregiverId: string;
  /** Tour, deren Fachkraft am Tourtag laut Vertrag nicht arbeitet. */
  let freierTagRouteId: string;
  /** Tour, deren Fachkraft eine andere Qualifikation hat als die Stamm-Fachkraft. */
  let qualifikationRouteId: string;
  /** Tour einer Fachkraft, die an dem Tag genehmigt abwesend ist. */
  let abwesenheitRouteId: string;
  /** Dieselbe Fachkraft, aber ein Tag ausserhalb ihrer Abwesenheit. */
  let nachDerAbwesenheitRouteId: string;

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

    /*
     * Zwei Touren fuer die BESETZUNGS-Pruefung, an einem eigenen Tag
     * (Freitag, 04.09.2026), damit sie keine Zahl des Testtags veraendern.
     *
     * Beide bilden denselben Vorgang ab: die Tour war beim Planen in Ordnung,
     * und erst danach passte die Person nicht mehr zu ihr. Genau diese Luecke
     * schliesst die Pruefung auf Tour-Ebene -- beim Anlegen EINES Besuchs
     * wurde geprueft, aber danach fragt niemand je wieder.
     *
     * Die Zuordnung laeuft absichtlich ueber prisma und nicht ueber den
     * Dienst: der Dienst weist genau das ab, was hier entstehen soll. Im
     * Betrieb entsteht es trotzdem -- durch eine Vertragsaenderung oder einen
     * Wechsel der Stamm-Fachkraft, lange nach dem Anlegen des Besuchs.
     */
    const FREITAG = new Date("2026-09-04T09:00:00.000Z");

    const wochenendkraft = (await caregivers.createCaregiver(adminCtx, {
      firstName: "Wilma",
      lastName: "Wochenende",
      // Dieselbe Qualifikation wie die Stamm-Fachkraft: hier stoert allein
      // der Wochentag.
      qualification: "PFLEGEFACHKRAFT",
      contractType: "PART_50",
      weeklyHours: 20,
      workDays: ["SAT", "SUN"],
      maxPatients: 20,
      validFrom: new Date("2026-01-01T00:00:00.000Z"),
    })) as { id: string };

    const hilfskraft = (await caregivers.createCaregiver(adminCtx, {
      firstName: "Hanna",
      lastName: "Hilfe",
      // Arbeitet freitags; allein die Qualifikation passt nicht.
      qualification: "PFLEGEHILFSKRAFT",
      contractType: "FULL_100",
      weeklyHours: 39,
      workDays: [...ALL_DAYS],
      maxPatients: 20,
      validFrom: new Date("2026-01-01T00:00:00.000Z"),
    })) as { id: string };

    // Eine halbe Stunde auseinander: beide Patienten sind derselben
    // Stamm-Fachkraft zugeordnet, und der Doppelbuchungs-Schutz weist zwei
    // Termine derselben Fachkraft binnen 15 Minuten zurecht ab.
    const besuchAmFreitag = await makeVisit("Freitag", FREITAG);
    const besuchAmFreitagZwei = await makeVisit(
      "FreitagZwei",
      new Date(FREITAG.getTime() + 30 * 60_000),
    );

    const freierTag = await prisma.route.create({
      data: {
        organizationId,
        caregiverId: wochenendkraft.id,
        date: new Date("2026-09-04"),
        optimized: false,
      },
      select: { id: true },
    });
    const qualifikation = await prisma.route.create({
      data: {
        organizationId,
        caregiverId: hilfskraft.id,
        date: new Date("2026-09-04"),
        optimized: false,
      },
      select: { id: true },
    });
    freierTagRouteId = freierTag.id;
    qualifikationRouteId = qualifikation.id;

    await prisma.visit.update({
      where: { id: besuchAmFreitag },
      data: { routeId: freierTagRouteId },
    });
    await prisma.visit.update({
      where: { id: besuchAmFreitagZwei },
      data: { routeId: qualifikationRouteId },
    });

    /*
     * Dritter Fall: genehmigt abwesend.
     *
     * Krankgeschrieben von Donnerstag bis Freitag. Die Tour am Freitag darf
     * sie nicht fahren -- die am Samstag schon. Zwei Touren derselben Person
     * und nicht eine: die Regel ist erst dann geprueft, wenn sie auch einmal
     * SCHWEIGT. Eine Pruefung, die immer anschlaegt, ist von einer kaputten
     * nicht zu unterscheiden.
     */
    const kranke = (await caregivers.createCaregiver(adminCtx, {
      firstName: "Karin",
      lastName: "Krank",
      qualification: "PFLEGEFACHKRAFT",
      contractType: "FULL_100",
      weeklyHours: 39,
      workDays: [...ALL_DAYS],
      maxPatients: 20,
      validFrom: new Date("2026-01-01T00:00:00.000Z"),
    })) as { id: string };

    await prisma.absence.create({
      data: {
        organizationId,
        caregiverId: kranke.id,
        type: "SICK",
        status: "APPROVED",
        startDate: new Date("2026-09-03"),
        endDate: new Date("2026-09-04"),
      },
    });

    // Ein beantragter, aber nicht entschiedener Urlaub am Samstag: er darf
    // NICHTS melden. Ueber ihn hat noch niemand entschieden.
    await prisma.absence.create({
      data: {
        organizationId,
        caregiverId: kranke.id,
        type: "VACATION",
        status: "REQUESTED",
        startDate: new Date("2026-09-05"),
        endDate: new Date("2026-09-05"),
      },
    });

    const besuchWaehrendKrankheit = await makeVisit(
      "Krankheitstag",
      new Date(FREITAG.getTime() + 60 * 60_000),
    );
    const besuchDanach = await makeVisit("Samstag", new Date("2026-09-05T09:00:00.000Z"));

    const abwesenheit = await prisma.route.create({
      data: {
        organizationId,
        caregiverId: kranke.id,
        date: new Date("2026-09-04"),
        optimized: false,
      },
      select: { id: true },
    });
    const nachDerAbwesenheit = await prisma.route.create({
      data: {
        organizationId,
        caregiverId: kranke.id,
        date: new Date("2026-09-05"),
        optimized: false,
      },
      select: { id: true },
    });
    abwesenheitRouteId = abwesenheit.id;
    nachDerAbwesenheitRouteId = nachDerAbwesenheit.id;

    await prisma.visit.update({
      where: { id: besuchWaehrendKrankheit },
      data: { routeId: abwesenheitRouteId },
    });
    await prisma.visit.update({
      where: { id: besuchDanach },
      data: { routeId: nachDerAbwesenheitRouteId },
    });

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

  /*
   * Besetzung: darf die eingeteilte Fachkraft diese Besuche ueberhaupt fahren?
   *
   * Die Regeln selbst sind im Einheitstest geprueft (vrptw-staffing). Hier
   * geht es um das, was ein Einheitstest NICHT sehen kann: ob die Abfrage die
   * Spalten mitbringt, die die Pruefung braucht. Eine vergessene Relation im
   * select faellt sonst erst in der Produktion auf -- als Tour, die nie etwas
   * beanstandet, was von einer fehlerfreien Tour nicht zu unterscheiden ist.
   */
  const staffingOf = async (routeId: string): Promise<Staffing> =>
    ((await vrptw.getRoute(adminCtx, routeId)) as unknown as { staffing: Staffing }).staffing;

  it("meldet einen Besuch an einem vertraglich freien Tag", async () => {
    // Wilma arbeitet nur am Wochenende, die Tour liegt an einem Freitag.
    const staffing = await staffingOf(freierTagRouteId);

    expect(staffing.checked).toBe(true);
    expect(staffing.issues).toHaveLength(1);
    expect(staffing.issues[0]?.reason).toBe("off_day");
    expect(staffing.issues[0]?.weekday).toBe("FRI");
  });

  it("meldet eine Fachkraft mit der falschen Qualifikation", async () => {
    // Hanna arbeitet freitags, ist aber Hilfskraft -- der Patient ist einer
    // Fachkraft zugeordnet.
    const staffing = await staffingOf(qualifikationRouteId);

    expect(staffing.issues).toHaveLength(1);
    expect(staffing.issues[0]?.reason).toBe("qualification");
    expect(staffing.issues[0]?.actualQualification).toBe("PFLEGEHILFSKRAFT");
    expect(staffing.issues[0]?.requiredQualification).toBe("PFLEGEFACHKRAFT");
  });

  it("meldet einen Besuch waehrend einer genehmigten Abwesenheit", async () => {
    // Eine Krankmeldung nimmt der Fachkraft den Tag, aber bisher keine ihrer
    // Touren: eine Tour, die niemand faehrt, sah genauso aus wie eine
    // gefahrene -- bis der erste Patient anrief.
    const staffing = await staffingOf(abwesenheitRouteId);

    expect(staffing.issues).toHaveLength(1);
    expect(staffing.issues[0]?.reason).toBe("absence");
    expect(staffing.issues[0]?.absenceType).toBe("SICK");
  });

  it("schweigt am Tag nach der Abwesenheit und bei einem blossen Antrag", async () => {
    // Zwei Dinge in einem Fall, weil beide dasselbe pruefen: dass die Regel
    // auch SCHWEIGEN kann. Der Samstag liegt hinter der Krankschreibung, und
    // der Urlaubsantrag darauf ist nicht entschieden -- ueber einen offenen
    // Antrag zu warnen hiesse, eine Entscheidung zu melden, die aussteht.
    const staffing = await staffingOf(nachDerAbwesenheitRouteId);

    expect(staffing.checked).toBe(true);
    expect(staffing.issues).toEqual([]);
  });

  it("meldet je Tour, wie viele Besuche die Fachkraft nicht fahren duerfte", async () => {
    // Die Touren des Testtags gehoeren einer Fachkraft, die an allen Tagen
    // arbeitet und die passende Qualifikation hat. Steht hier etwas anderes
    // als 0, meldet die Uebersicht Fehlalarme.
    const day = await routeDay();

    expect(day.data.every((route) => route.staffingIssueCount === 0)).toBe(true);
  });
});
