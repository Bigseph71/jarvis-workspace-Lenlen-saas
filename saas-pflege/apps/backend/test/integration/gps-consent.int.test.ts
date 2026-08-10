/**
 * GPS-Einwilligung und ihre Durchsetzung, gegen eine ECHTE Datenbank.
 * Aktivierung wie in auth-flow.int.test.ts (RUN_DB_TESTS=1 + TEST_DATABASE_URL).
 *
 * Warum als Integrationstest: die entscheidende Zusicherung ist nicht, dass
 * eine Funktion `false` zurückgibt, sondern dass in gps_positions NICHTS
 * landet, solange kein Rechtsgrund vorliegt. Das lässt sich nur an der echten
 * Tabelle zeigen. Ebenso die Append-only-Eigenschaft: dass ein Widerruf die
 * frühere Einwilligung nicht löscht, ist eine Aussage über Zeilen, nicht über
 * Rückgabewerte – und sie trägt den Nachweis nach Art. 7 Abs. 1 DSGVO.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { assertLocalTestDatabase } from "../helpers/test-database.js";

const runDbTests = process.env.RUN_DB_TESTS === "1";
const adminEmail = `consent-admin+${Date.now()}@demo.de`;
const fachkraftEmail = `consent-fk+${Date.now()}@demo.de`;

describe.skipIf(!runDbTests)("GPS-Einwilligung (DB)", () => {
  let prisma: typeof import("@len-len/database").prisma;
  let consent: typeof import("../../src/modules/consent/consent.service.js");
  let tracking: typeof import("../../src/modules/tracking/tracking.service.js");
  let policyVersion: string;

  let organizationId: string;
  let caregiverId: string;
  /** Kontext der FACHKRAFT (nicht des Admins): nur sie darf einwilligen. */
  let fkCtx: { organizationId: string; userId: string | null };

  const positionCount = async (): Promise<number> =>
    prisma.gpsPosition.count({ where: { organizationId, caregiverId } });

  const sendPosition = async (): Promise<unknown> =>
    tracking.recordPosition(fkCtx, { latitude: 49.4, longitude: 8.68 });

  beforeAll(async () => {
    assertLocalTestDatabase(process.env.DATABASE_URL);

    ({ prisma } = await import("@len-len/database"));
    const auth = await import("../../src/modules/auth/auth.service.js");
    const caregivers = await import("../../src/modules/caregivers/caregiver.service.js");
    const users = await import("../../src/modules/users/user.service.js");
    consent = await import("../../src/modules/consent/consent.service.js");
    tracking = await import("../../src/modules/tracking/tracking.service.js");
    ({ GPS_POLICY_VERSION: policyVersion } = await import(
      "../../src/modules/consent/consent.policy.js"
    ));

    const registered = await auth.registerOrganization({
      organizationName: "EinwilligungTest GmbH",
      country: "DE",
      adminEmail,
      adminPassword: "Sehr-Sicher-123",
    });
    organizationId = registered.user.organizationId;
    // Die Registrierung legt den Tenant GESPERRT an (Zahlungsmittel
    // erforderlich). Diese Tests prüfen die Fachlichkeit, nicht die
    // Abrechnung – deshalb hier freischalten, sonst weist assertWithinPlan
    // jedes Anlegen mit 402 ab.
    await prisma.organization.update({
      where: { id: organizationId },
      data: { subscriptionStatus: "ACTIVE" },
    });
    const adminCtx = { organizationId, userId: registered.user.id };

    // Erst die Fachkraft, dann ihr Konto: createFachkraftUser hängt das Konto
    // an ein BESTEHENDES Profil. recordPosition leitet die caregiverId immer
    // aus dem eingeloggten Konto ab, die Verknüpfung ist also Voraussetzung.
    const created = (await caregivers.createCaregiver(adminCtx, {
      firstName: "Lea",
      lastName: "Standort",
      qualification: "PFLEGEFACHKRAFT",
      contractType: "FULL_100",
      weeklyHours: 39,
      workDays: ["MON", "TUE", "WED", "THU", "FRI"],
      maxPatients: 10,
      validFrom: new Date("2026-01-01T00:00:00.000Z"),
    })) as { id: string };
    caregiverId = created.id;

    const account = await users.createFachkraftUser(adminCtx, {
      caregiverId,
      email: fachkraftEmail,
      language: "DE",
    });

    fkCtx = { organizationId, userId: account.user.id };
  });

  afterAll(async () => {
    if (!prisma) return;
    const orgId =
      organizationId ??
      (await prisma.user.findFirst({ where: { email: adminEmail }, select: { organizationId: true } }))
        ?.organizationId;
    if (orgId) await prisma.organization.delete({ where: { id: orgId } });
    await prisma.$disconnect();
  });

  it("ohne Einwilligung wird KEINE Position gespeichert", async () => {
    // Der Kern der ganzen Änderung: vorher lief genau das durch.
    await expect(sendPosition()).rejects.toMatchObject({ code: "GpsConsentMissing" });
    expect(await positionCount()).toBe(0);
  });

  it("der Ausgangszustand ist 'nicht eingewilligt'", async () => {
    const status = await consent.getGpsConsentStatus(fkCtx);
    expect(status.granted).toBe(false);
    // Nie zugestimmt -> keine akzeptierte Version. Das unterscheidet den
    // Erstfall vom Fall "Text geändert" (dort ist acceptedVersion gesetzt).
    expect(status.acceptedVersion).toBeNull();
    expect(status.currentVersion).toBe(policyVersion);
  });

  it("nach der Einwilligung wird die Position gespeichert", async () => {
    await consent.grantGpsConsent(fkCtx, { policyVersion, locale: "DE" });

    const status = await consent.getGpsConsentStatus(fkCtx);
    expect(status.granted).toBe(true);
    expect(status.acceptedVersion).toBe(policyVersion);

    await sendPosition();
    expect(await positionCount()).toBe(1);
  });

  it("eine veraltete Textversion wird abgelehnt", async () => {
    // Eine alte App könnte sonst Zustimmung zu einem Text einsammeln, der
    // längst nicht mehr gilt.
    await expect(
      consent.grantGpsConsent(fkCtx, { policyVersion: "1999-01-01", locale: "DE" }),
    ).rejects.toMatchObject({ code: "ConsentVersionMismatch" });
  });

  it("der Widerruf stoppt die Erfassung ab sofort", async () => {
    await consent.revokeGpsConsent(fkCtx);

    expect((await consent.getGpsConsentStatus(fkCtx)).granted).toBe(false);
    await expect(sendPosition()).rejects.toMatchObject({ code: "GpsConsentMissing" });

    // Art. 7 Abs. 3: der Widerruf wirkt nur für die Zukunft. Die vorher
    // rechtmäßig erhobene Position bleibt bestehen.
    expect(await positionCount()).toBe(1);
  });

  it("der Widerruf löscht die Einwilligung nicht, er schließt sie", async () => {
    // Art. 7 Abs. 1: der Verantwortliche muss nachweisen können, dass zum
    // Zeitpunkt der Erhebung eingewilligt war. Ein gelöschter Datensatz
    // könnte das nie.
    const rows = await prisma.gpsConsent.findMany({
      where: { organizationId, caregiverId },
      orderBy: { grantedAt: "asc" },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.revokedAt).not.toBeNull();
    expect(rows[0]!.policyVersion).toBe(policyVersion);
  });

  it("eine erneute Einwilligung legt eine ZWEITE Zeile an", async () => {
    await consent.grantGpsConsent(fkCtx, { policyVersion, locale: "DE" });

    const rows = await prisma.gpsConsent.findMany({
      where: { organizationId, caregiverId },
      orderBy: { grantedAt: "asc" },
    });
    expect(rows).toHaveLength(2);
    // Die erste bleibt widerrufen: die Historie wird fortgeschrieben, nicht
    // korrigiert.
    expect(rows[0]!.revokedAt).not.toBeNull();
    expect(rows[1]!.revokedAt).toBeNull();

    await sendPosition();
    expect(await positionCount()).toBe(2);
  });

  it("ein Widerruf schließt ALLE offenen Einwilligungen", async () => {
    // Mehrfache Erteilung (z.B. auf zwei Geräten) hinterlässt mehrere offene
    // Zeilen. Bliebe eine davon offen, wäre die Erfassung weiter gedeckt.
    await consent.grantGpsConsent(fkCtx, { policyVersion, locale: "DE" });
    expect(
      await prisma.gpsConsent.count({ where: { organizationId, caregiverId, revokedAt: null } }),
    ).toBe(2);

    await consent.revokeGpsConsent(fkCtx);

    expect(
      await prisma.gpsConsent.count({ where: { organizationId, caregiverId, revokedAt: null } }),
    ).toBe(0);
    await expect(sendPosition()).rejects.toMatchObject({ code: "GpsConsentMissing" });
  });

  it("jede Erteilung und jeder Widerruf steht im Audit-Log", async () => {
    // Der Nachweis lebt nicht allein von der Tabelle: das Audit-Log hält fest,
    // WER die Handlung ausgelöst hat.
    const entries = await prisma.auditLog.findMany({
      where: { organizationId, entityType: "gps_consent" },
    });
    const events = entries.map((e) => (e.metadata as { event?: string }).event);
    expect(events.filter((e) => e === "gps_consent_granted").length).toBe(3);
    expect(events.filter((e) => e === "gps_consent_revoked").length).toBe(2);
    expect(entries.every((e) => e.userId === fkCtx.userId)).toBe(true);
  });
});
