import { AuditAction, withTenant } from "@len-len/database";
import { AppError, ForbiddenError } from "../../lib/errors.js";
import { writeAudit } from "../../lib/audit.js";
import type { TenantContext, TenantTx } from "../../lib/context.js";

/**
 * Datenauskunft nach DSGVO Art. 15 (Auskunft) und Art. 20 (Übertragbarkeit).
 *
 * Rollenverteilung, die dieses Modul voraussetzt: Verantwortlicher im Sinne der
 * DSGVO ist der Pflegedienst, nicht diese Plattform – die ist
 * Auftragsverarbeiter. Die Plattform beantwortet Betroffenenanfragen also
 * nicht selbst, sie gibt dem Tenant das Werkzeug, seiner eigenen Pflicht
 * nachzukommen. Deshalb exportiert der Struktur-Admin für seine Betroffenen,
 * und jede Person zusätzlich für sich selbst.
 *
 * Format: JSON. Art. 20 verlangt "strukturiert, gängig und maschinenlesbar";
 * JSON erfüllt alle drei, CSV bräuchte je Entität eine eigene Datei.
 */

/** Feste Hülle jedes Exports – macht die Datei ohne Zusatzwissen deutbar. */
export interface ExportEnvelope<T> {
  /** Zeitpunkt der Erstellung (ISO 8601). */
  exportedAt: string;
  subjectType: "patient" | "caregiver" | "user";
  subjectId: string;
  organizationId: string;
  /**
   * Was NICHT enthalten ist, und warum. Ohne diesen Hinweis wirkt ein Export
   * vollständig, obwohl bewusst Felder fehlen (Zugangsdaten, fremde
   * personenbezogene Daten).
   */
  excluded: string[];
  data: T;
}

function envelope<T>(
  subjectType: ExportEnvelope<T>["subjectType"],
  subjectId: string,
  organizationId: string,
  excluded: string[],
  data: T,
): ExportEnvelope<T> {
  return {
    exportedAt: new Date().toISOString(),
    subjectType,
    subjectId,
    organizationId,
    excluded,
    data,
  };
}

/**
 * Zugangsdaten sind KEINE Auskunft im Sinne von Art. 15.
 *
 * `passwordHash` und `mfaSecret` gehören zwar zum Datensatz der Person, ihre
 * Herausgabe schafft aber ein Sicherheitsrisiko ohne jeden Erkenntniswert:
 * ein Hash beantwortet keine Frage, die sich die betroffene Person stellt,
 * und ein MFA-Secret im Klartext hebt den zweiten Faktor auf. Gleiches gilt
 * für Refresh-Token, die aktive Sitzungen sind.
 *
 * Das ist keine Verweigerung der Auskunft: dass ein Passwort und ggf. ein
 * zweiter Faktor gespeichert sind, steht als Tatsache im Export.
 */
const EXCLUDED_CREDENTIALS = [
  "users.passwordHash (Zugangsdaten, kein Erkenntniswert)",
  "users.mfaSecret (Herausgabe würde den zweiten Faktor aufheben)",
  "refresh_tokens (aktive Sitzungen, keine Auskunftsdaten)",
];

/** Auswahl der User-Felder, die in einen Export dürfen. Whitelist, nie Spread. */
const USER_FIELDS = {
  id: true,
  email: true,
  role: true,
  language: true,
  isActive: true,
  mfaEnabled: true,
  mustChangePassword: true,
  lastLoginAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

// ── Patient ───────────────────────────────────────────────────────────────

/**
 * Alle Daten zu EINEM Patienten. Enthält bewusst auch den Namen der Fachkraft
 * je Besuch: wer die Pflege erbracht hat, ist Teil der Auskunft des Patienten
 * über die ihn betreffende Verarbeitung.
 */
export async function exportPatient(ctx: TenantContext, patientId: string): Promise<ExportEnvelope<unknown>> {
  return withTenant(ctx.organizationId, async (tx) => {
    const patient = await tx.patient.findFirst({
      where: { id: patientId, organizationId: ctx.organizationId },
      include: {
        assignedCaregiver: { select: { id: true, firstName: true, lastName: true } },
      },
    });
    if (!patient) throw new AppError(404, "Patient nicht gefunden", "NotFound");

    const visits = await tx.visit.findMany({
      where: { organizationId: ctx.organizationId, patientId },
      orderBy: { scheduledAt: "asc" },
      include: {
        caregiver: { select: { id: true, firstName: true, lastName: true } },
        assignedCaregiver: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    // Art. 15 Abs. 1: Auskunft umfasst auch, WIE mit den Daten umgegangen wurde.
    const accessLog = await tx.auditLog.findMany({
      where: { organizationId: ctx.organizationId, entityType: "patient", entityId: patientId },
      orderBy: { createdAt: "asc" },
      select: { action: true, createdAt: true, metadata: true },
    });

    // Der Export ist selbst ein Lesezugriff auf Patientendaten und wird wie
    // jeder andere protokolliert (CLAUDE.md: Audit-Log für Patientendaten).
    await writeAudit(tx, ctx, {
      action: AuditAction.READ,
      entityType: "patient",
      entityId: patientId,
      metadata: { event: "dsgvo_export", visits: visits.length },
    });

    return envelope("patient", patientId, ctx.organizationId, [], {
      patient,
      visits,
      accessLog,
    });
  });
}

// ── Fachkraft (Beschäftigtendaten) ────────────────────────────────────────

/**
 * Alle Daten zu EINER Fachkraft.
 *
 * Patientenidentitäten bleiben draußen: an einem Besuch ist für die Fachkraft
 * ihre eigene Arbeitsleistung die Auskunft, WER gepflegt wurde ist das
 * personenbezogene Datum des Patienten, nicht ihres. Das ist zugleich der
 * Grund, warum diese Auskunft auch der HR-Rolle offensteht, die laut RBAC
 * keine Patientendaten sehen darf.
 */
export async function exportCaregiver(
  ctx: TenantContext,
  caregiverId: string,
): Promise<ExportEnvelope<unknown>> {
  return withTenant(ctx.organizationId, async (tx) => {
    const caregiver = await tx.caregiver.findFirst({
      where: { id: caregiverId, organizationId: ctx.organizationId },
      include: { user: { select: USER_FIELDS } },
    });
    if (!caregiver) throw new AppError(404, "Fachkraft nicht gefunden", "NotFound");

    const where = { organizationId: ctx.organizationId, caregiverId };

    const [contracts, workSchedules, absences, gpsConsents, gpsPositions, messages, routes] =
      await Promise.all([
        tx.contract.findMany({ where, orderBy: { validFrom: "asc" } }),
        tx.workSchedule.findMany({ where, orderBy: { date: "asc" } }),
        tx.absence.findMany({ where, orderBy: { startDate: "asc" } }),
        // Die Einwilligungshistorie gehört in die Auskunft: sie belegt, worauf
        // sich die Standorterfassung stützte (Art. 7 Abs. 1).
        tx.gpsConsent.findMany({ where, orderBy: { grantedAt: "asc" } }),
        tx.gpsPosition.findMany({ where, orderBy: { recordedAt: "asc" } }),
        tx.message.findMany({ where, orderBy: { createdAt: "asc" } }),
        tx.route.findMany({ where, orderBy: { date: "asc" } }),
      ]);

    // Besuche OHNE Patientenbezug: nur die eigene Leistung, keine fremde Identität.
    const visits = await tx.visit.findMany({
      where: {
        organizationId: ctx.organizationId,
        OR: [{ caregiverId }, { assignedCaregiverId: caregiverId }],
      },
      orderBy: { scheduledAt: "asc" },
      select: {
        id: true,
        scheduledAt: true,
        status: true,
        isEmergency: true,
        caregiverId: true,
        assignedCaregiverId: true,
        gpsArrivalAt: true,
        gpsDepartureAt: true,
      },
    });

    const accessLog = caregiver.user
      ? await tx.auditLog.findMany({
          where: { organizationId: ctx.organizationId, userId: caregiver.user.id },
          orderBy: { createdAt: "asc" },
          select: { action: true, entityType: true, createdAt: true, metadata: true },
        })
      : [];

    await writeAudit(tx, ctx, {
      action: AuditAction.READ,
      entityType: "caregiver",
      entityId: caregiverId,
      metadata: { event: "dsgvo_export" },
    });

    return envelope(
      "caregiver",
      caregiverId,
      ctx.organizationId,
      [
        ...EXCLUDED_CREDENTIALS,
        "visits.patient (Identität des Patienten ist dessen Datum, nicht das der Fachkraft)",
      ],
      {
        caregiver,
        contracts,
        workSchedules,
        absences,
        gpsConsents,
        gpsPositions,
        visits,
        messages,
        routes,
        accessLog,
      },
    );
  });
}

// ── Selbstauskunft ────────────────────────────────────────────────────────

/**
 * Auskunft der eingeloggten Person über sich selbst. Kein Rollenvorbehalt:
 * Art. 15 steht jeder betroffenen Person zu, unabhängig davon, was sie im
 * System sonst darf.
 *
 * Hat das Konto ein Fachkraft-Profil, ist die Beschäftigtenauskunft die
 * vollständigere und wird ausgeliefert.
 */
export async function exportSelf(ctx: TenantContext): Promise<ExportEnvelope<unknown>> {
  if (!ctx.userId) throw new ForbiddenError("Kein Benutzerkonto im Kontext");
  const userId = ctx.userId;

  const caregiverId = await withTenant(ctx.organizationId, async (tx: TenantTx) => {
    const caregiver = await tx.caregiver.findFirst({
      where: { userId, organizationId: ctx.organizationId },
      select: { id: true },
    });
    return caregiver?.id ?? null;
  });

  if (caregiverId) return exportCaregiver(ctx, caregiverId);

  // Konto ohne Fachkraft-Profil (Admin, Koordination, HR).
  return withTenant(ctx.organizationId, async (tx) => {
    const user = await tx.user.findFirst({
      where: { id: userId, organizationId: ctx.organizationId },
      select: USER_FIELDS,
    });
    if (!user) throw new AppError(404, "Benutzer nicht gefunden", "NotFound");

    const [messages, accessLog, decidedAbsences] = await Promise.all([
      tx.message.findMany({
        where: { organizationId: ctx.organizationId, senderUserId: userId },
        orderBy: { createdAt: "asc" },
      }),
      tx.auditLog.findMany({
        where: { organizationId: ctx.organizationId, userId },
        orderBy: { createdAt: "asc" },
        select: { action: true, entityType: true, createdAt: true, metadata: true },
      }),
      tx.absence.findMany({
        where: { organizationId: ctx.organizationId, decidedByUserId: userId },
        select: { id: true, decidedAt: true, status: true },
      }),
    ]);

    await writeAudit(tx, ctx, {
      action: AuditAction.READ,
      entityType: "user",
      entityId: userId,
      metadata: { event: "dsgvo_self_export" },
    });

    return envelope("user", userId, ctx.organizationId, EXCLUDED_CREDENTIALS, {
      user,
      messages,
      decidedAbsences,
      accessLog,
    });
  });
}
