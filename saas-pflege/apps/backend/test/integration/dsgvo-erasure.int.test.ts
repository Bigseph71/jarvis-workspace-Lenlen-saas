/**
 * Recht auf Löschung (DSGVO Art. 17) für eine Fachkraft, gegen eine ECHTE
 * Datenbank. Aktivierung wie in auth-flow.int.test.ts.
 *
 * Der Kern dieser Tests ist die UNTERSCHEIDUNG: was verschwindet, was bleibt.
 * Beide Richtungen sind gleich wichtig. Zu wenig zu löschen verfehlt Art. 17;
 * zu viel zu löschen zerstört die Pflegedokumentation, die zehn Jahre
 * aufbewahrt werden muss (§ 630f BGB), und macht unauffindbar, wer auf
 * Patientendaten zugegriffen hat.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { assertLocalTestDatabase } from "../helpers/test-database.js";

const runDbTests = process.env.RUN_DB_TESTS === "1";
const adminEmail = `erasure-admin+${Date.now()}@demo.de`;
const fachkraftEmail = `erasure-fk+${Date.now()}@demo.de`;

describe.skipIf(!runDbTests)("DSGVO-Löschung einer Fachkraft (DB)", () => {
  let prisma: typeof import("@len-len/database").prisma;
  let erasure: typeof import("../../src/modules/export/erasure.service.js");

  let organizationId: string;
  let adminCtx: { organizationId: string; userId: string | null };
  let caregiverId: string;
  let userId: string;
  let visitId: string;
  let absenceId: string;

  beforeAll(async () => {
    assertLocalTestDatabase(process.env.DATABASE_URL);

    ({ prisma } = await import("@len-len/database"));
    const auth = await import("../../src/modules/auth/auth.service.js");
    const caregivers = await import("../../src/modules/caregivers/caregiver.service.js");
    const patients = await import("../../src/modules/patients/patient.service.js");
    const users = await import("../../src/modules/users/user.service.js");
    const consent = await import("../../src/modules/consent/consent.service.js");
    const tracking = await import("../../src/modules/tracking/tracking.service.js");
    const { GPS_POLICY_VERSION } = await import("../../src/modules/consent/consent.policy.js");
    erasure = await import("../../src/modules/export/erasure.service.js");

    const registered = await auth.registerOrganization({
      organizationName: "LoeschungTest GmbH",
      country: "DE",
      adminEmail,
      adminPassword: "Sehr-Sicher-123",
    });
    organizationId = registered.user.organizationId;
    adminCtx = { organizationId, userId: registered.user.id };

    const cg = (await caregivers.createCaregiver(adminCtx, {
      firstName: "Marta",
      lastName: "Vergessen",
      qualification: "PFLEGEFACHKRAFT",
      contractType: "FULL_100",
      weeklyHours: 39,
      workDays: ["MON", "TUE"],
      maxPatients: 5,
      validFrom: new Date("2026-01-01T00:00:00.000Z"),
    })) as { id: string };
    caregiverId = cg.id;

    const account = await users.createFachkraftUser(adminCtx, {
      caregiverId,
      email: fachkraftEmail,
      language: "DE",
    });
    userId = account.user.id;
    const fkCtx = { organizationId, userId };

    const patient = (await patients.createPatient(adminCtx, {
      firstName: "Karl",
      lastName: "Patient",
      rawAddress: "Bergstraße 5, 69117 Heidelberg",
      assignedCaregiverId: caregiverId,
    })) as { id: string };

    // Ein Besuch: die erbrachte Leistung, die die Löschung ÜBERLEBEN muss.
    const visit = await prisma.visit.create({
      data: {
        organizationId,
        patientId: patient.id,
        caregiverId,
        assignedCaregiverId: caregiverId,
        scheduledAt: new Date("2026-02-02T09:00:00.000Z"),
      },
      select: { id: true },
    });
    visitId = visit.id;

    // Abwesenheit mit Freitext: der Text muss weg, Typ und Zeitraum bleiben.
    const absence = await prisma.absence.create({
      data: {
        organizationId,
        caregiverId,
        type: "SICK",
        startDate: new Date("2026-03-01"),
        endDate: new Date("2026-03-05"),
        reason: "Bandscheibenvorfall, Reha beantragt",
      },
      select: { id: true },
    });
    absenceId = absence.id;

    // Einwilligung + Position: beides muss verschwinden.
    await consent.grantGpsConsent(fkCtx, { policyVersion: GPS_POLICY_VERSION, locale: "DE" });
    await tracking.recordPosition(fkCtx, { latitude: 49.41, longitude: 8.69 });

    // Eine Sitzung, damit deren Beendigung prüfbar ist.
    await prisma.refreshToken.create({
      data: {
        userId,
        tokenHash: `hash-${Date.now()}`,
        expiresAt: new Date(Date.now() + 86_400_000),
      },
    });
  });

  afterAll(async () => {
    if (!prisma) return;
    if (organizationId) await prisma.organization.delete({ where: { id: organizationId } });
    await prisma.$disconnect();
  });

  it("anonymisiert und meldet, was geschah", async () => {
    const report = await erasure.anonymizeCaregiver(adminCtx, caregiverId);

    expect(report.deleted.gpsPositions).toBe(1);
    expect(report.deleted.gpsConsents).toBe(1);
    expect(report.deleted.refreshTokens).toBe(1);
    expect(report.deleted.absenceReasons).toBe(1);
    expect(report.userAnonymized).toBe(true);
    // Der Bericht nennt auch, was ABSICHTLICH bleibt – sonst wirkte die
    // Löschung unvollständig, statt begründet begrenzt.
    expect(report.retained.some((r) => r.includes("630f"))).toBe(true);
  });

  // ── Was verschwinden musste ────────────────────────────────────────────

  it("der Name ist fort", async () => {
    const cg = await prisma.caregiver.findUniqueOrThrow({ where: { id: caregiverId } });
    expect(cg.firstName).toBe("Anonymisiert");
    expect(cg.lastName).not.toContain("Vergessen");
    expect(cg.anonymizedAt).not.toBeNull();
  });

  it("Standortdaten und Einwilligung sind gelöscht", async () => {
    // Sie beruhten allein auf der Einwilligung – ohne die Person kein Grund.
    expect(await prisma.gpsPosition.count({ where: { caregiverId } })).toBe(0);
    expect(await prisma.gpsConsent.count({ where: { caregiverId } })).toBe(0);
  });

  it("das Konto ist unbrauchbar und die Sitzungen sind beendet", async () => {
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(user.email).not.toContain("erasure-fk");
    // .invalid ist per RFC 2606 nicht auflösbar: die Adresse erreicht niemanden.
    expect(user.email.endsWith("@invalid")).toBe(true);
    expect(user.isActive).toBe(false);
    expect(user.mfaSecret).toBeNull();
    expect(await prisma.refreshToken.count({ where: { userId } })).toBe(0);
  });

  it("der Freitext der Abwesenheit ist fort, Typ und Zeitraum bleiben", async () => {
    // Der Text konnte Krankheitsdetails enthalten (Art. 9); der Typ trägt den
    // Arbeitszeitnachweis und bleibt deshalb.
    const absence = await prisma.absence.findUniqueOrThrow({ where: { id: absenceId } });
    expect(absence.reason).toBeNull();
    expect(absence.type).toBe("SICK");
    expect(absence.startDate).not.toBeNull();
  });

  // ── Was bleiben musste ─────────────────────────────────────────────────

  it("der Besuch bleibt und zeigt weiter auf die Fachkraft", async () => {
    // § 630f BGB: die Pflegedokumentation ist zehn Jahre aufzubewahren, und
    // Regel 4 verlangt nachvollziehbar, WER geleistet hat. Ein SetNull hier
    // hätte beides zerstört.
    const visit = await prisma.visit.findUniqueOrThrow({ where: { id: visitId } });
    expect(visit.caregiverId).toBe(caregiverId);
    expect(visit.assignedCaregiverId).toBe(caregiverId);
  });

  it("Verträge und Arbeitszeiten bleiben", async () => {
    expect(await prisma.contract.count({ where: { caregiverId } })).toBeGreaterThan(0);
  });

  it("die Audit-Einträge bleiben der Person zugeordnet", async () => {
    // Entscheidend: WER auf Patientendaten zugegriffen hat, muss beantwortbar
    // bleiben – das ist ein Recht des PATIENTEN (Art. 15 Abs. 1 lit. c).
    // Ein Löschen des Kontos hätte diese Einträge über SetNull entankert.
    const entries = await prisma.auditLog.count({ where: { organizationId, userId } });
    expect(entries).toBeGreaterThan(0);
  });

  it("die Löschung selbst steht im Audit-Log", async () => {
    const entries = await prisma.auditLog.findMany({
      where: { organizationId, entityType: "caregiver", action: "DELETE" },
    });
    expect(entries.some((e) => (e.metadata as { event?: string }).event === "dsgvo_anonymized")).toBe(
      true,
    );
  });

  // ── Wiederholung ───────────────────────────────────────────────────────

  it("ein zweiter Aufruf überschreibt nicht erneut", async () => {
    // Sonst wäre der zweite Lauf ein stiller No-op auf bereits pseudonymen
    // Daten – oder schlimmer, er würde das Pseudonym neu würfeln.
    await expect(erasure.anonymizeCaregiver(adminCtx, caregiverId)).rejects.toMatchObject({
      code: "AlreadyAnonymized",
    });
  });

  it("eine fremde Fachkraft ist nicht anonymisierbar", async () => {
    const other = await prisma.organization.create({
      data: { name: "Fremde Loeschung GmbH", country: "DE" },
      select: { id: true },
    });
    try {
      await expect(
        erasure.anonymizeCaregiver({ organizationId: other.id, userId: null }, caregiverId),
      ).rejects.toMatchObject({ code: "NotFound" });
    } finally {
      await prisma.organization.delete({ where: { id: other.id } });
    }
  });
});
