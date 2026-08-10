/**
 * Datenauskunft nach DSGVO Art. 15/20, gegen eine ECHTE Datenbank.
 * Aktivierung wie in auth-flow.int.test.ts (RUN_DB_TESTS=1 + TEST_DATABASE_URL).
 *
 * Warum Integrationstest: die Zusicherung, die zählt, ist negativ – dass
 * bestimmte Felder NICHT im Export stehen. Das lässt sich nur am vollständig
 * zusammengebauten Ergebnis prüfen, nicht an einer einzelnen Funktion. Ein
 * Passwort-Hash, der über die Auskunft nach außen ginge, wäre ein Datenleck,
 * das ausgerechnet ein Datenschutz-Feature verursacht.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { assertLocalTestDatabase } from "../helpers/test-database.js";

const runDbTests = process.env.RUN_DB_TESTS === "1";
const adminEmail = `export-admin+${Date.now()}@demo.de`;
const fachkraftEmail = `export-fk+${Date.now()}@demo.de`;

/** Sucht rekursiv nach einem Schlüssel – für "darf nirgends vorkommen". */
function findKey(value: unknown, key: string): boolean {
  if (value === null || typeof value !== "object") return false;
  if (Array.isArray(value)) return value.some((v) => findKey(v, key));
  const obj = value as Record<string, unknown>;
  if (Object.prototype.hasOwnProperty.call(obj, key)) return true;
  return Object.values(obj).some((v) => findKey(v, key));
}

/** Sucht rekursiv nach einem Wert – für "dieser String darf nicht auftauchen". */
function containsValue(value: unknown, needle: string): boolean {
  if (typeof value === "string") return value.includes(needle);
  if (value === null || typeof value !== "object") return false;
  if (Array.isArray(value)) return value.some((v) => containsValue(v, needle));
  return Object.values(value as Record<string, unknown>).some((v) => containsValue(v, needle));
}

describe.skipIf(!runDbTests)("DSGVO-Datenauskunft (DB)", () => {
  let prisma: typeof import("@len-len/database").prisma;
  let exports_: typeof import("../../src/modules/export/export.service.js");

  let organizationId: string;
  let adminCtx: { organizationId: string; userId: string | null };
  let fkCtx: { organizationId: string; userId: string | null };
  let caregiverId: string;
  let patientId: string;

  beforeAll(async () => {
    assertLocalTestDatabase(process.env.DATABASE_URL);

    ({ prisma } = await import("@len-len/database"));
    const auth = await import("../../src/modules/auth/auth.service.js");
    const caregivers = await import("../../src/modules/caregivers/caregiver.service.js");
    const patients = await import("../../src/modules/patients/patient.service.js");
    const users = await import("../../src/modules/users/user.service.js");
    const consent = await import("../../src/modules/consent/consent.service.js");
    const { GPS_POLICY_VERSION } = await import("../../src/modules/consent/consent.policy.js");
    exports_ = await import("../../src/modules/export/export.service.js");

    const registered = await auth.registerOrganization({
      organizationName: "AuskunftTest GmbH",
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
    adminCtx = { organizationId, userId: registered.user.id };

    const cg = (await caregivers.createCaregiver(adminCtx, {
      firstName: "Nora",
      lastName: "Auskunft",
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
    fkCtx = { organizationId, userId: account.user.id };

    const p = (await patients.createPatient(adminCtx, {
      firstName: "Otto",
      lastName: "Geheimhaltung",
      rawAddress: "Hauptstraße 1, 69117 Heidelberg",
      assignedCaregiverId: caregiverId,
    })) as { id: string };
    patientId = p.id;

    // Einwilligung + eine Position: der Export soll beides zeigen.
    await consent.grantGpsConsent(fkCtx, { policyVersion: GPS_POLICY_VERSION, locale: "DE" });
    const tracking = await import("../../src/modules/tracking/tracking.service.js");
    await tracking.recordPosition(fkCtx, { latitude: 49.41, longitude: 8.69 });
  });

  afterAll(async () => {
    if (!prisma) return;
    if (organizationId) await prisma.organization.delete({ where: { id: organizationId } });
    await prisma.$disconnect();
  });

  // ── Das Wichtigste: was NICHT herauskommen darf ────────────────────────

  it("gibt NIEMALS den Passwort-Hash heraus", async () => {
    const own = await exports_.exportCaregiver(adminCtx, caregiverId);
    const self = await exports_.exportSelf(fkCtx);
    for (const doc of [own, self]) {
      expect(findKey(doc, "passwordHash")).toBe(false);
      expect(findKey(doc, "password_hash")).toBe(false);
    }
  });

  it("gibt NIEMALS das MFA-Secret heraus", async () => {
    // Ein im Klartext ausgeliefertes Secret hebt den zweiten Faktor auf.
    const doc = await exports_.exportCaregiver(adminCtx, caregiverId);
    expect(findKey(doc, "mfaSecret")).toBe(false);
    // Die TATSACHE, dass MFA aktiv ist, gehört dagegen in die Auskunft.
    expect(findKey(doc, "mfaEnabled")).toBe(true);
  });

  it("legt offen, was bewusst fehlt", async () => {
    // Ohne diesen Hinweis wirkt der Export vollständig, obwohl Felder fehlen.
    const doc = await exports_.exportCaregiver(adminCtx, caregiverId);
    expect(doc.excluded.some((e) => e.includes("passwordHash"))).toBe(true);
    expect(doc.excluded.some((e) => e.includes("mfaSecret"))).toBe(true);
  });

  it("nennt in der Fachkraft-Auskunft KEINE Patientenidentität", async () => {
    // Wer gepflegt wurde, ist das Datum des Patienten, nicht das der Fachkraft.
    // Zugleich der Grund, warum HR diese Auskunft ziehen darf.
    const doc = await exports_.exportCaregiver(adminCtx, caregiverId);
    expect(containsValue(doc, "Geheimhaltung")).toBe(false);
    expect(containsValue(doc, "Hauptstraße 1")).toBe(false);
  });

  // ── Vollständigkeit ────────────────────────────────────────────────────

  it("die Fachkraft-Auskunft enthält Vertrag, Einwilligung und Positionen", async () => {
    const doc = await exports_.exportCaregiver(adminCtx, caregiverId);
    const data = doc.data as Record<string, unknown[]>;
    expect(data.contracts.length).toBeGreaterThan(0);
    // Die Einwilligungshistorie belegt, worauf sich die Erfassung stützte.
    expect(data.gpsConsents.length).toBe(1);
    expect(data.gpsPositions.length).toBe(1);
    expect(doc.subjectType).toBe("caregiver");
    expect(doc.subjectId).toBe(caregiverId);
  });

  it("die Patienten-Auskunft enthält Stammdaten und Zugriffshistorie", async () => {
    const doc = await exports_.exportPatient(adminCtx, patientId);
    const data = doc.data as { patient: { lastName: string }; accessLog: unknown[] };
    expect(data.patient.lastName).toBe("Geheimhaltung");
    // Art. 15 Abs. 1: auch WIE mit den Daten umgegangen wurde.
    expect(Array.isArray(data.accessLog)).toBe(true);
  });

  it("die Selbstauskunft eines Kontos ohne Fachkraft-Profil liefert Nutzerdaten", async () => {
    const doc = await exports_.exportSelf(adminCtx);
    expect(doc.subjectType).toBe("user");
    expect(findKey(doc, "passwordHash")).toBe(false);
  });

  it("die Selbstauskunft einer Fachkraft liefert die Beschäftigtenauskunft", async () => {
    const doc = await exports_.exportSelf(fkCtx);
    expect(doc.subjectType).toBe("caregiver");
    expect(doc.subjectId).toBe(caregiverId);
  });

  // ── Mandantentrennung und Protokollierung ──────────────────────────────

  it("ein fremder Patient ist über die Auskunft nicht erreichbar", async () => {
    const other = await prisma.organization.create({
      data: { name: "Fremde GmbH", country: "DE" },
      select: { id: true },
    });
    try {
      const foreignCtx = { organizationId: other.id, userId: null };
      // RLS + expliziter Tenant-Filter: der Patient existiert, gehört aber
      // einem anderen Mandanten -> 404, kein Datenabfluss.
      await expect(exports_.exportPatient(foreignCtx, patientId)).rejects.toMatchObject({
        code: "NotFound",
      });
    } finally {
      await prisma.organization.delete({ where: { id: other.id } });
    }
  });

  it("jeder Export steht im Audit-Log", async () => {
    // Der Export ist selbst ein Lesezugriff auf personenbezogene Daten.
    const entries = await prisma.auditLog.findMany({
      where: { organizationId, action: "READ" },
    });
    const events = entries.map((e) => (e.metadata as { event?: string }).event);
    expect(events).toContain("dsgvo_export");
    expect(events).toContain("dsgvo_self_export");
  });
});
