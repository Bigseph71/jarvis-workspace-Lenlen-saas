/**
 * HTTP-Schicht des HR-Moduls: parsen, autorisieren, delegieren. Keine
 * Geschäftslogik – die liegt vollständig im Service, damit CSV-Import und
 * Personio-Konnektor (Phase 3) dieselben Regeln erben, ohne über HTTP zu gehen.
 *
 * Zugriff: Struktur-Admin und HR. Der HR-Rolle stehen laut RBAC-Tabelle keine
 * Patientendaten zu – dieses Modul liefert ausschließlich Fachkraft-bezogene
 * Vertrags- und Zeitdaten, also keine.
 */

import { z } from "zod";
import { AbsenceStatus, UserRole } from "@len-len/database";
import { AppError } from "../../lib/errors.js";
import type { FastifyInstance } from "fastify";
import { authenticate } from "../../plugins/authenticate.js";
import { requireRole } from "../../plugins/rbac.js";
import type { TenantContext } from "../../lib/context.js";
import {
  absenceBatchSchema,
  absenceDecisionSchema,
  absenceItemSchema,
  contractBatchSchema,
  contractItemSchema,
  endContractSchema,
  listAbsencesQuerySchema,
  listContractsQuerySchema,
  listSchedulesQuerySchema,
  scheduleBatchSchema,
  scheduleItemSchema,
} from "./hr.schemas.js";
import type { BatchOutcome } from "./hr.service.js";
import {
  decideAbsence,
  deleteSchedule,
  endContract,
  listAbsences,
  listContracts,
  listSchedules,
  upsertAbsences,
  upsertContracts,
  upsertSchedules,
} from "./hr.service.js";

const idParamSchema = z.object({ id: z.string().uuid() });

// Lesen: Admin, HR und Koordinator (die Planung braucht Verfügbarkeiten).
const canRead = requireRole(
  UserRole.STRUKTUR_ADMIN,
  UserRole.HR,
  UserRole.KOORDINATOR,
);
// Schreiben: Vertragsmodul = Admin + HR.
const canWrite = requireRole(UserRole.STRUKTUR_ADMIN, UserRole.HR);

function ctxFrom(req: { user?: { userId: string; organizationId: string } }): TenantContext {
  return { organizationId: req.user!.organizationId, userId: req.user!.userId };
}

/**
 * Einzel-Anlage = Lot der Größe 1. So gibt es genau EINEN Schreibpfad, den
 * REST-Aufruf, CSV-Import und Konnektor teilen.
 */
const singleAsBatch = <T>(item: T): { items: T[]; dryRun: boolean } => ({
  items: [item],
  dryRun: false,
});

/**
 * Übersetzt das Lot-Ergebnis einer Einzel-Anlage in eine HTTP-Antwort: den
 * angelegten Datensatz, oder 422 mit dem Grund.
 *
 * Ein Umschlag mit `rejected: [...]` ist der richtige Bericht für einen Import,
 * aber die falsche Antwort auf "lege diesen einen Vertrag an": der Client
 * müsste ihn auspacken, und ein Fehlerstatus ohne verwertbare Meldung bliebe
 * beim Benutzer als "es hat nicht geklappt" stehen.
 */
function singleResult<T>(outcome: BatchOutcome<T>): T {
  const rejection = outcome.rejected[0];
  if (rejection) {
    throw new AppError(422, rejection.reasons.join(" ; "), "UnprocessableEntity");
  }
  return outcome.applied[0]!.record;
}

export async function hrRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", authenticate);

  // ── Verträge ────────────────────────────────────────────────────────────

  app.get("/hr/contracts", { preHandler: [canRead] }, async (request) => {
    const query = listContractsQuerySchema.parse(request.query);
    return listContracts(ctxFrom(request), query);
  });

  app.post("/hr/contracts", { preHandler: [canWrite] }, async (request, reply) => {
    const item = contractItemSchema.parse(request.body);
    const result = await upsertContracts(ctxFrom(request), singleAsBatch(item));
    return reply.status(201).send(singleResult(result));
  });

  // Lot + Dry-Run: der Einstiegspunkt für CSV-Import und Konnektoren.
  app.post("/hr/contracts/batch", { preHandler: [canWrite] }, async (request) => {
    const input = contractBatchSchema.parse(request.body);
    return upsertContracts(ctxFrom(request), input);
  });

  app.post("/hr/contracts/:id/end", { preHandler: [canWrite] }, async (request) => {
    const { id } = idParamSchema.parse(request.params);
    const input = endContractSchema.parse(request.body);
    return endContract(ctxFrom(request), id, input);
  });

  // ── Dienstpläne ─────────────────────────────────────────────────────────

  app.get("/hr/schedules", { preHandler: [canRead] }, async (request) => {
    const query = listSchedulesQuerySchema.parse(request.query);
    return listSchedules(ctxFrom(request), query);
  });

  app.post("/hr/schedules", { preHandler: [canWrite] }, async (request, reply) => {
    const item = scheduleItemSchema.parse(request.body);
    const result = await upsertSchedules(ctxFrom(request), singleAsBatch(item));
    return reply.status(201).send(singleResult(result));
  });

  app.post("/hr/schedules/batch", { preHandler: [canWrite] }, async (request) => {
    const input = scheduleBatchSchema.parse(request.body);
    return upsertSchedules(ctxFrom(request), input);
  });

  app.delete("/hr/schedules/:id", { preHandler: [canWrite] }, async (request, reply) => {
    const { id } = idParamSchema.parse(request.params);
    await deleteSchedule(ctxFrom(request), id);
    return reply.status(204).send();
  });

  // ── Abwesenheiten ───────────────────────────────────────────────────────

  app.get("/hr/absences", { preHandler: [canRead] }, async (request) => {
    const query = listAbsencesQuerySchema.parse(request.query);
    return listAbsences(ctxFrom(request), query);
  });

  app.post("/hr/absences", { preHandler: [canWrite] }, async (request, reply) => {
    const item = absenceItemSchema.parse(request.body);
    const result = await upsertAbsences(ctxFrom(request), singleAsBatch(item));
    return reply.status(201).send(singleResult(result));
  });

  app.post("/hr/absences/batch", { preHandler: [canWrite] }, async (request) => {
    const input = absenceBatchSchema.parse(request.body);
    return upsertAbsences(ctxFrom(request), input);
  });

  app.post("/hr/absences/:id/approve", { preHandler: [canWrite] }, async (request) => {
    const { id } = idParamSchema.parse(request.params);
    const input = absenceDecisionSchema.parse(request.body ?? {});
    return decideAbsence(ctxFrom(request), id, AbsenceStatus.APPROVED, input);
  });

  app.post("/hr/absences/:id/reject", { preHandler: [canWrite] }, async (request) => {
    const { id } = idParamSchema.parse(request.params);
    const input = absenceDecisionSchema.parse(request.body ?? {});
    return decideAbsence(ctxFrom(request), id, AbsenceStatus.REJECTED, input);
  });

  app.post("/hr/absences/:id/cancel", { preHandler: [canWrite] }, async (request) => {
    const { id } = idParamSchema.parse(request.params);
    const input = absenceDecisionSchema.parse(request.body ?? {});
    return decideAbsence(ctxFrom(request), id, AbsenceStatus.CANCELED, input);
  });
}
