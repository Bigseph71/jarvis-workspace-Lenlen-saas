/**
 * Découpage géographique quotidien, contre une VRAIE base.
 *
 * Activation comme les autres tests DB : RUN_DB_TESTS=1 + TEST_DATABASE_URL.
 * La CI les exécute (conteneur Postgres jetable), ces assertions ne sont donc
 * pas décoratives.
 *
 * Pourquoi en intégration plutôt qu'en unitaire : les algorithmes eux-mêmes
 * sont couverts par clustering-dbscan.test.ts et clustering-kmeans.test.ts,
 * sans base. Ce qui se joue ici est ce qu'aucun test de fonction pure ne peut
 * montrer : qu'un patient d'une AUTRE structure n'apparaît jamais dans le
 * découpage, qu'une adresse non géocodée bloque le calcul au lieu de produire
 * un secteur faux, et qu'un plan Basic est refusé avant tout calcul.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { assertLocalTestDatabase } from "../helpers/test-database.js";

const runDbTests = process.env.RUN_DB_TESTS === "1";
const stamp = Date.now();
const adminA = `clustering-a+${stamp}@demo.de`;
const adminB = `clustering-b+${stamp}@demo.de`;

/** Lundi. Le jour de la semaine compte : les fachkräfte ne travaillent pas tous les jours. */
const TEST_DATE = "2026-09-07";
/** 10:00 heure de Berlin : franchement à l'intérieur de la journée locale. */
const VISIT_AT = new Date("2026-09-07T08:00:00.000Z");

/** Quartiers nord de Heidelberg (groupe 1). */
const NORTH = [
  { first: "Gertrud", last: "Nord", lat: 49.4304, lng: 8.6772 },
  { first: "Wilhelm", last: "Nord", lat: 49.4192, lng: 8.6873 },
  { first: "Ilse", last: "Nord", lat: 49.418, lng: 8.689 },
];
/** Quartiers sud, à environ 5 km (groupe 2). */
const SOUTH = [
  { first: "Ottmar", last: "Sued", lat: 49.3771, lng: 8.6808 },
  { first: "Helga", last: "Sued", lat: 49.3796, lng: 8.7014 },
  { first: "Rudolf", last: "Sued", lat: 49.3722, lng: 8.6941 },
];

describe.skipIf(!runDbTests)("Gebietsaufteilung (DB)", () => {
  let prisma: typeof import("@len-len/database").prisma;
  let clustering: typeof import("../../src/modules/clustering/clustering.service.js");

  let orgA: string;
  let orgB: string;
  let ctxA: { organizationId: string; userId: string | null };

  /** Crée un patient géocodé et sa visite du jour de test. */
  async function seedPatient(
    organizationId: string,
    person: { first: string; last: string; lat: number; lng: number },
    options: { caregiverId?: string; status?: "VALID" | "INVALID" | "PENDING" } = {},
  ): Promise<{ patientId: string; visitId: string }> {
    const status = options.status ?? "VALID";
    const geocoded = status === "VALID";
    const patient = await prisma.patient.create({
      data: {
        organizationId,
        firstName: person.first,
        lastName: person.last,
        rawAddress: `${person.last}straße 1, Heidelberg`,
        latitude: geocoded ? person.lat : null,
        longitude: geocoded ? person.lng : null,
        geocodingStatus: status,
        assignedCaregiverId: options.caregiverId ?? null,
      },
    });
    const visit = await prisma.visit.create({
      data: {
        organizationId,
        patientId: patient.id,
        scheduledAt: VISIT_AT,
        status: "PLANNED",
      },
    });
    return { patientId: patient.id, visitId: visit.id };
  }

  beforeAll(async () => {
    assertLocalTestDatabase(process.env.DATABASE_URL);

    ({ prisma } = await import("@len-len/database"));
    clustering = await import("../../src/modules/clustering/clustering.service.js");
    const auth = await import("../../src/modules/auth/auth.service.js");

    const a = await auth.registerOrganization({
      organizationName: "Cluster A GmbH",
      country: "DE",
      adminEmail: adminA,
      adminPassword: "Sehr-Sicher-123",
    });
    const b = await auth.registerOrganization({
      organizationName: "Cluster B GmbH",
      country: "DE",
      adminEmail: adminB,
      adminPassword: "Sehr-Sicher-123",
    });
    orgA = a.user.organizationId;
    orgB = b.user.organizationId;
    ctxA = { organizationId: orgA, userId: a.user.id };

    // L'inscription crée le tenant suspendu (moyen de paiement requis) et en
    // plan Basic. Ces tests portent sur la fachlichkeit, pas sur la facturation.
    for (const id of [orgA, orgB]) {
      await prisma.organization.update({
        where: { id },
        data: {
          subscriptionStatus: "ACTIVE",
          subscriptionPlan: "PRO",
          planLimits: { patients: 1000, caregivers: 100, vehicles: 30, ki: true },
        },
      });
    }

    // Deux fachkräfte dans A, chacune ancrée sur un secteur par sa patientèle.
    // Sans patient attitré, une fachkraft n'a pas de secteur et ne peut pas
    // être suggérée : la suggestion serait un tirage au sort.
    const nordFk = await prisma.caregiver.create({
      data: {
        organizationId: orgA,
        firstName: "Anna",
        lastName: "Nordpflege",
        qualification: "PFLEGEFACHKRAFT",
        contractType: "FULL_100",
        weeklyHours: 40,
        workDays: ["MON", "TUE", "WED", "THU", "FRI"],
        maxPatients: 12,
      },
    });
    const suedFk = await prisma.caregiver.create({
      data: {
        organizationId: orgA,
        firstName: "Markus",
        lastName: "Suedpflege",
        qualification: "PFLEGEFACHKRAFT",
        contractType: "FULL_100",
        weeklyHours: 40,
        workDays: ["MON", "TUE", "WED", "THU", "FRI"],
        maxPatients: 12,
      },
    });

    for (const person of NORTH) await seedPatient(orgA, person, { caregiverId: nordFk.id });
    for (const person of SOUTH) await seedPatient(orgA, person, { caregiverId: suedFk.id });

    // Un patient de l'AUTRE structure, au milieu du secteur nord de A. Placé
    // là exprès : s'il fuit, il fuit dans un groupe existant et le test le voit.
    await seedPatient(orgB, { first: "Fremde", last: "Struktur", lat: 49.4195, lng: 8.6875 });
  });

  afterAll(async () => {
    if (!prisma) return;
    for (const id of [orgA, orgB]) {
      if (id) await prisma.organization.delete({ where: { id } }).catch(() => undefined);
    }
    await prisma.$disconnect();
  });

  it("DBSCAN sépare les deux secteurs et suggère une fachkraft pour chacun", async () => {
    const result = await clustering.computeDailyClustering(ctxA, {
      date: TEST_DATE,
      algorithm: "dbscan",
      epsilonKm: 2,
      minPoints: 2,
    });

    expect(result.patientCount).toBe(6);
    expect(result.clusters).toHaveLength(2);
    expect(result.unassigned).toEqual([]);

    for (const cluster of result.clusters) {
      expect(cluster.patientCount).toBe(3);
      // Diamètre d'un secteur urbain : de l'ordre de quelques km, jamais la
      // taille de la ville. Un secteur trop large signalerait une fusion.
      expect(cluster.maxDistanceKm).toBeGreaterThan(0);
      expect(cluster.maxDistanceKm).toBeLessThan(3);
      expect(cluster.suggestedCaregiver).not.toBeNull();
    }

    // Chaque fachkraft n'est proposée qu'une fois : proposer la même personne
    // pour deux secteurs n'aurait aucun sens opérationnel.
    const suggested = result.clusters.map((c) => c.suggestedCaregiver!.id);
    expect(new Set(suggested).size).toBe(2);

    // La fachkraft du nord doit être suggérée pour le secteur nord.
    const north = result.clusters.find((c) => c.patients.some((p) => p.lastName === "Nord"))!;
    expect(north.suggestedCaregiver!.lastName).toBe("Nordpflege");
  });

  it("k-means découpe en exactement k secteurs", async () => {
    const result = await clustering.computeDailyClustering(ctxA, {
      date: TEST_DATE,
      algorithm: "kmeans",
      k: 3,
    });

    expect(result.clusters).toHaveLength(3);
    expect(result.clusters.reduce((sum, c) => sum + c.patientCount, 0)).toBe(6);
    // k-means classe tout : jamais de non-classés, contrairement à DBSCAN.
    expect(result.unassigned).toEqual([]);
  });

  it("ne renvoie JAMAIS un patient d'une autre structure", async () => {
    // La garantie qui compte. Le patient de B est posé au cœur du secteur nord
    // de A : une requête mal filtrée l'agrégerait sans que rien ne le signale.
    //
    // Ce que ce test exerce précisément : le filtre organizationId des requêtes
    // du service. En CI la connexion est propriétaire des tables et contourne
    // donc la RLS (rls.sql ne pose pas FORCE, pour ne pas casser le chemin
    // système). La RLS reste la seconde barrière en production, où la
    // connexion applicative n'est pas propriétaire.
    const result = await clustering.computeDailyClustering(ctxA, {
      date: TEST_DATE,
      algorithm: "dbscan",
      epsilonKm: 2,
      minPoints: 2,
    });

    const names = [...result.clusters.flatMap((c) => c.patients), ...result.unassigned].map(
      (p) => p.lastName,
    );
    expect(names).not.toContain("Struktur");
    expect(result.patientCount).toBe(6);

    // Et symétriquement : B ne voit que le sien.
    const fromB = await clustering.computeDailyClustering(
      { organizationId: orgB, userId: null },
      { date: TEST_DATE, algorithm: "dbscan" },
    );
    expect(fromB.patientCount).toBe(1);
  });

  it("bloque tant qu'une adresse du jour n'est pas géocodée", async () => {
    // Règle 7. Regrouper sur une coordonnée absente produirait un secteur faux,
    // que le VRPTW transformerait ensuite en tournée fausse : l'erreur se
    // propagerait sans jamais être signalée.
    const broken = await seedPatient(
      orgA,
      { first: "Hildegard", last: "Ohnekoordinate", lat: 0, lng: 0 },
      { status: "INVALID" },
    );

    await expect(
      clustering.computeDailyClustering(ctxA, { date: TEST_DATE, algorithm: "dbscan" }),
    ).rejects.toMatchObject({ code: "GeocodingIncomplete", statusCode: 409 });

    await prisma.visit.delete({ where: { id: broken.visitId } });
    await prisma.patient.delete({ where: { id: broken.patientId } });

    // Une fois l'adresse retirée, le calcul repart : le blocage porte bien sur
    // la donnée en défaut, pas sur la journée entière une fois pour toutes.
    await expect(
      clustering.computeDailyClustering(ctxA, { date: TEST_DATE, algorithm: "dbscan" }),
    ).resolves.toMatchObject({ patientCount: 6 });
  });

  it("refuse le découpage automatique au plan Basic", async () => {
    await prisma.organization.update({
      where: { id: orgA },
      data: { subscriptionPlan: "BASIC", planLimits: {} },
    });

    await expect(
      clustering.computeDailyClustering(ctxA, { date: TEST_DATE, algorithm: "dbscan" }),
    // 402 und nicht 403: dasselbe Signal wie bei jeder anderen Plansperre im
    // Produkt. Vier Seiten des Frontends hängen an genau diesem Status.
    ).rejects.toMatchObject({ code: "PlanFeatureUnavailable", statusCode: 402 });

    // Une capacité négociée sur un tenant Basic doit rouvrir l'accès sans
    // toucher au code : le test porte sur la capacité, pas sur le nom du plan.
    await prisma.organization.update({
      where: { id: orgA },
      data: { planLimits: { ki: true } },
    });
    await expect(
      clustering.computeDailyClustering(ctxA, { date: TEST_DATE, algorithm: "dbscan" }),
    ).resolves.toMatchObject({ patientCount: 6 });

    await prisma.organization.update({
      where: { id: orgA },
      data: { subscriptionPlan: "PRO", planLimits: { patients: 1000, caregivers: 100, vehicles: 30, ki: true } },
    });
  });

  it("renvoie un découpage vide pour une journée sans visite", async () => {
    const result = await clustering.computeDailyClustering(ctxA, {
      date: "2026-09-13",
      algorithm: "dbscan",
    });
    expect(result).toMatchObject({ patientCount: 0, clusters: [], unassigned: [] });
  });

  it("trace chaque calcul dans le journal d'audit", async () => {
    const before = await prisma.auditLog.count({
      where: { organizationId: orgA, entityType: "clustering" },
    });
    await clustering.computeDailyClustering(ctxA, { date: TEST_DATE, algorithm: "dbscan" });
    const after = await prisma.auditLog.count({
      where: { organizationId: orgA, entityType: "clustering" },
    });

    // Le découpage LIT des données patients : la DSGVO impose d'en garder trace.
    expect(after).toBe(before + 1);
  });
});
