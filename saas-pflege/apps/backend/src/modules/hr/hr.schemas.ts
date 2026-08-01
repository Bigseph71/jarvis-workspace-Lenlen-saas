import { z } from "zod";
import { AbsenceStatus, AbsenceType, ContractType, ExternalSource } from "@len-len/database";
import { paginationSchema } from "../../lib/pagination.js";
import { weekDaySchema } from "../caregivers/caregiver.schemas.js";
import { parseTimeToMinutes } from "./hr.rules.js";

/**
 * Obergrenze eines Lots. Groß genug für einen realistischen CSV-Import einer
 * Struktur (200 Fachkräfte), klein genug, damit eine Transaktion nicht ewig
 * offen bleibt. Größere Dateien zerlegt der Importer in mehrere Lots.
 */
export const MAX_BATCH_SIZE = 500;

/**
 * Datum ohne Uhrzeit, auf UTC-Mitternacht normalisiert (die DB-Spalten sind
 * DATE).
 *
 * Der Rückweg-Vergleich ist kein Zierrat: V8 nimmt "2026-02-31" klaglos an und
 * macht daraus den 3. März. Ein Tippfehler in einer CSV-Zeile würde sonst als
 * gültiges, nur falsches Datum durchlaufen. Nur wenn das geparste Datum
 * denselben Tag zurückliefert, war die Eingabe wirklich einer.
 */
const dateOnly = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Datum im Format YYYY-MM-DD erwartet")
  .refine((v) => {
    const parsed = new Date(`${v}T00:00:00.000Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === v;
  }, "Ungültiges Datum")
  .transform((v) => new Date(`${v}T00:00:00.000Z`));

/** "08:30" -> 510 (Minuten seit Mitternacht). */
const timeOfDay = z
  .string()
  .refine((v) => parseTimeToMinutes(v) !== null, "Uhrzeit im Format HH:MM erwartet")
  .transform((v) => parseTimeToMinutes(v) as number);

/**
 * Herkunftsschlüssel. Ohne externalId gilt der natürliche Schlüssel der
 * jeweiligen Entität – manuelle Eingaben brauchen keine externe ID.
 */
const externalRef = {
  externalId: z.string().trim().min(1).max(120).optional(),
  externalSource: z.nativeEnum(ExternalSource).default(ExternalSource.MANUAL),
};

/** Dry-Run: derselbe Code-Pfad, am Ende zurückgerollt (siehe hr.service.ts). */
const batchOptions = { dryRun: z.boolean().default(false) };

// ── Verträge ──────────────────────────────────────────────────────────────

export const contractItemSchema = z.object({
  caregiverId: z.string().uuid(),
  contractType: z.nativeEnum(ContractType),
  weeklyHours: z.number().positive().max(60),
  workDays: z.array(weekDaySchema).min(1).max(7),
  maxPatients: z.number().int().min(0).max(500),
  validFrom: dateOnly,
  // null = laufender Vertrag
  validUntil: dateOnly.nullable().default(null),
  ...externalRef,
});

export const contractBatchSchema = z.object({
  items: z.array(contractItemSchema).min(1).max(MAX_BATCH_SIZE),
  ...batchOptions,
});

export const endContractSchema = z.object({ validUntil: dateOnly });

export const listContractsQuerySchema = paginationSchema.extend({
  caregiverId: z.string().uuid().optional(),
  /** Nur der zu diesem Datum geltende Vertrag. */
  activeOn: dateOnly.optional(),
  /** Inkrementelle Synchronisation: alles, was seither geändert wurde. */
  updatedSince: z.string().datetime().transform((v) => new Date(v)).optional(),
});

// ── Dienstpläne ───────────────────────────────────────────────────────────

export const scheduleItemSchema = z.object({
  caregiverId: z.string().uuid(),
  date: dateOnly,
  start: timeOfDay,
  end: timeOfDay,
  breakMinutes: z.number().int().min(0).max(480).default(0),
  note: z.string().trim().max(500).optional(),
  ...externalRef,
});

export const scheduleBatchSchema = z.object({
  items: z.array(scheduleItemSchema).min(1).max(MAX_BATCH_SIZE),
  ...batchOptions,
});

export const listSchedulesQuerySchema = paginationSchema.extend({
  caregiverId: z.string().uuid().optional(),
  from: dateOnly.optional(),
  to: dateOnly.optional(),
  updatedSince: z.string().datetime().transform((v) => new Date(v)).optional(),
});

// ── Abwesenheiten ─────────────────────────────────────────────────────────

export const absenceItemSchema = z.object({
  caregiverId: z.string().uuid(),
  type: z.nativeEnum(AbsenceType),
  startDate: dateOnly,
  endDate: dateOnly,
  reason: z.string().trim().max(500).optional(),
  ...externalRef,
});

export const absenceBatchSchema = z.object({
  items: z.array(absenceItemSchema).min(1).max(MAX_BATCH_SIZE),
  ...batchOptions,
});

/** Genehmigen / Ablehnen / Zurückziehen. */
export const absenceDecisionSchema = z.object({
  reason: z.string().trim().max(500).optional(),
});

export const listAbsencesQuerySchema = paginationSchema.extend({
  caregiverId: z.string().uuid().optional(),
  status: z.nativeEnum(AbsenceStatus).optional(),
  from: dateOnly.optional(),
  to: dateOnly.optional(),
  updatedSince: z.string().datetime().transform((v) => new Date(v)).optional(),
});

export type ContractItemInput = z.infer<typeof contractItemSchema>;
export type ContractBatchInput = z.infer<typeof contractBatchSchema>;
export type EndContractInput = z.infer<typeof endContractSchema>;
export type ListContractsQuery = z.infer<typeof listContractsQuerySchema>;

export type ScheduleItemInput = z.infer<typeof scheduleItemSchema>;
export type ScheduleBatchInput = z.infer<typeof scheduleBatchSchema>;
export type ListSchedulesQuery = z.infer<typeof listSchedulesQuerySchema>;

export type AbsenceItemInput = z.infer<typeof absenceItemSchema>;
export type AbsenceBatchInput = z.infer<typeof absenceBatchSchema>;
export type AbsenceDecisionInput = z.infer<typeof absenceDecisionSchema>;
export type ListAbsencesQuery = z.infer<typeof listAbsencesQuerySchema>;
