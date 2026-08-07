import { AuditAction, withTenant } from "@len-len/database";
import { randomUUID } from "node:crypto";
import { AppError } from "../../lib/errors.js";
import { writeAudit } from "../../lib/audit.js";
import { hashPassword } from "../../lib/password.js";
import type { TenantContext } from "../../lib/context.js";

/**
 * Recht auf Löschung (DSGVO Art. 17) für eine Fachkraft.
 *
 * Vollständiges Löschen scheidet aus: die von ihr erbrachten Leistungen sind
 * Teil der Pflegedokumentation, die der Arbeitgeber zehn Jahre aufbewahren
 * muss (§ 630f BGB), und Arbeitszeiten unterliegen eigenen Fristen
 * (§ 16 ArbZG, § 257 HGB). Art. 17 Abs. 3 lit. b nimmt genau solche
 * Aufbewahrungspflichten von der Löschung aus.
 *
 * Deshalb wird nach Datenart unterschieden, statt pauschal zu löschen oder
 * pauschal zu behalten:
 *
 *  GELÖSCHT   – was allein auf Einwilligung beruhte oder reine Sitzungsdaten
 *               sind: GPS-Positionen, Einwilligungen, Refresh-Token, sowie der
 *               Freitext von Abwesenheiten (kann Krankheitsdetails enthalten).
 *
 *  ANONYMISIERT – Name und Konto. Die ZEILEN bleiben, nur die Identität geht.
 *
 *  UNVERÄNDERT – Besuche, Touren, Verträge, Arbeitszeiten, Abwesenheitstyp und
 *               -zeitraum, Nachrichten, Audit-Einträge.
 *
 * Warum das Benutzerkonto anonymisiert und nicht gelöscht wird: `AuditLog.user`
 * steht auf `SetNull`. Ein Löschen würde alle Audit-Einträge dieser Person
 * entankern – die Organisation könnte dann nicht mehr beantworten, WER auf die
 * Daten eines Patienten zugegriffen hat. Das ist seinerseits ein Recht des
 * PATIENTEN (Art. 15 Abs. 1 lit. c). Die Pseudonymisierung erhält die Kette und
 * nimmt trotzdem die Identifizierbarkeit.
 */

/** Was bei der Anonymisierung tatsächlich geschah – Grundlage des Nachweises. */
export interface ErasureReport {
  caregiverId: string;
  anonymizedAt: string;
  deleted: {
    gpsPositions: number;
    gpsConsents: number;
    refreshTokens: number;
    absenceReasons: number;
  };
  /** true = ein verknüpftes Benutzerkonto wurde pseudonymisiert. */
  userAnonymized: boolean;
  /** Erhalten gebliebene Datenarten, mit Grund. */
  retained: string[];
}

const RETAINED = [
  "visits (Pflegedokumentation, § 630f BGB – 10 Jahre)",
  "routes (Nachvollziehbarkeit der Einsatzplanung)",
  "contracts (§ 257 HGB / § 147 AO)",
  "work_schedules (§ 16 ArbZG)",
  "absences: Typ und Zeitraum (Arbeitszeitnachweis; Freitext gelöscht)",
  "messages (Betriebskommunikation, Absender pseudonymisiert)",
  "audit_logs (Nachweis der Verarbeitung; Art. 15 Abs. 1 lit. c des Patienten)",
];

/**
 * Anonymisiert eine Fachkraft. Idempotent: ein bereits anonymisierter
 * Datensatz führt zu 409 statt zu einer zweiten Überschreibung.
 */
export async function anonymizeCaregiver(
  ctx: TenantContext,
  caregiverId: string,
): Promise<ErasureReport> {
  // Außerhalb der Transaktion: Argon2 ist absichtlich langsam (~50 ms) und
  // hätte in der TX nur die Sperren länger gehalten.
  const unusablePasswordHash = await hashPassword(randomUUID());

  return withTenant(ctx.organizationId, async (tx) => {
    const caregiver = await tx.caregiver.findFirst({
      where: { id: caregiverId, organizationId: ctx.organizationId },
      select: { id: true, userId: true, anonymizedAt: true },
    });
    if (!caregiver) throw new AppError(404, "Fachkraft nicht gefunden", "NotFound");
    if (caregiver.anonymizedAt) {
      throw new AppError(409, "Fachkraft ist bereits anonymisiert", "AlreadyAnonymized");
    }

    const anonymizedAt = new Date();
    const where = { organizationId: ctx.organizationId, caregiverId };

    // ── Gelöscht ────────────────────────────────────────────────────────
    // Standortdaten und ihre Einwilligung als Paar: die Einwilligung war der
    // Rechtsgrund für die Positionen, ohne Positionen ist nichts mehr zu
    // belegen (Art. 7 Abs. 1 endet mit der Verarbeitung, die er stützte).
    const gpsPositions = await tx.gpsPosition.deleteMany({ where });
    const gpsConsents = await tx.gpsConsent.deleteMany({ where });

    // Freitext einer Abwesenheit kann Krankheitsdetails enthalten (Art. 9).
    // Typ und Zeitraum bleiben: sie tragen den Arbeitszeitnachweis.
    const absenceReasons = await tx.absence.updateMany({
      where: { ...where, reason: { not: null } },
      data: { reason: null },
    });

    // ── Anonymisiert ────────────────────────────────────────────────────
    // Kurzform der ID als Pseudonym: stabil, innerhalb des Tenants eindeutig
    // und nicht auf den echten Namen zurückführbar.
    const shortId = caregiverId.slice(0, 8);
    await tx.caregiver.update({
      where: { id: caregiverId },
      data: {
        firstName: "Anonymisiert",
        lastName: `Fachkraft-${shortId}`,
        anonymizedAt,
        isActive: false,
        deactivatedAt: caregiver.anonymizedAt ?? anonymizedAt,
      },
    });

    let refreshTokens = 0;
    if (caregiver.userId) {
      // Sitzungen zuerst: sonst bliebe ein ausgestelltes Refresh-Token gültig.
      refreshTokens = (await tx.refreshToken.deleteMany({ where: { userId: caregiver.userId } }))
        .count;

      // .invalid ist per RFC 2606 garantiert nicht auflösbar – die Adresse
      // kann niemanden mehr erreichen und kollidiert mit keiner echten.
      await tx.user.update({
        where: { id: caregiver.userId },
        data: {
          email: `geloescht+${shortId}@invalid`,
          passwordHash: unusablePasswordHash,
          mfaEnabled: false,
          mfaSecret: null,
          // Der eigentliche Riegel: login() filtert auf isActive.
          isActive: false,
        },
      });
    }

    await writeAudit(tx, ctx, {
      action: AuditAction.DELETE,
      entityType: "caregiver",
      entityId: caregiverId,
      metadata: {
        event: "dsgvo_anonymized",
        anonymizedAt: anonymizedAt.toISOString(),
        deletedGpsPositions: gpsPositions.count,
        deletedGpsConsents: gpsConsents.count,
      },
    });

    return {
      caregiverId,
      anonymizedAt: anonymizedAt.toISOString(),
      deleted: {
        gpsPositions: gpsPositions.count,
        gpsConsents: gpsConsents.count,
        refreshTokens,
        absenceReasons: absenceReasons.count,
      },
      userAnonymized: caregiver.userId !== null,
      retained: RETAINED,
    };
  });
}
