/**
 * HR-Service: Verträge, Dienstpläne, Abwesenheiten.
 *
 * Bauprinzip (CLAUDE.md, "Intégrations HR tierces" – Contrainte de conception):
 *
 *   - Die Geschäftslogik lebt HIER, nicht in den Route-Handlern. Ein REST-Aufruf,
 *     ein CSV-Import und der spätere Personio-Konnektor erreichen dieselbe
 *     Funktion und damit dieselben Prüfungen.
 *   - Jede Schreiboperation ist ein LOT. Der Einzelfall ist das Lot der Größe 1,
 *     nicht umgekehrt – 500 Verträge zu importieren sind ein Aufruf, nicht 500.
 *   - `dryRun` läuft denselben Pfad und rollt am Ende zurück. Der Bericht zeigt
 *     also, was wirklich passieren würde, nicht was eine zweite
 *     Validierungs-Implementierung vermutet.
 *   - Mutationen melden Domänen-Ereignisse (siehe lib/domain-events.ts). Der
 *     DATEV-Webhook abonniert sie später, ohne dass hier eine Zeile dazukommt.
 */

import {
  AbsenceStatus,
  AuditAction,
  withTenant,
  type ExternalSource,
  type Prisma,
} from "@len-len/database";
import { AppError } from "../../lib/errors.js";
import { writeAudit } from "../../lib/audit.js";
import { paginated, toSkipTake, type Paginated } from "../../lib/pagination.js";
import {
  withDomainEvents,
  type DomainEventName,
  type EmitFn,
} from "../../lib/domain-events.js";
import { startOfISOWeek, weekRange, type WeekDay } from "../../lib/week.js";
import type { TenantContext, TenantTx } from "../../lib/context.js";
import {
  absenceViolations,
  activeAt,
  contractViolations,
  netWorkMinutes,
  scheduleViolations,
  type ContractRule,
  type Period,
} from "./hr.rules.js";
import type {
  AbsenceBatchInput,
  AbsenceDecisionInput,
  ContractBatchInput,
  ContractItemInput,
  EndContractInput,
  ListAbsencesQuery,
  ListContractsQuery,
  ListSchedulesQuery,
  ScheduleBatchInput,
} from "./hr.schemas.js";

// ── Lot-Ergebnis ──────────────────────────────────────────────────────────

export interface BatchRejection {
  /** Position in der Eingabe – im CSV-Bericht die Zeilennummer. */
  index: number;
  caregiverId: string;
  externalId?: string;
  reasons: string[];
}

export interface BatchApplied<T> {
  index: number;
  id: string;
  caregiverId: string;
  action: "created" | "updated";
  record: T;
}

export interface BatchOutcome<T> {
  dryRun: boolean;
  applied: BatchApplied<T>[];
  rejected: BatchRejection[];
  summary: { total: number; created: number; updated: number; rejected: number };
}

/**
 * Bricht die Transaktion eines Dry-Runs ab und trägt das Ergebnis nach außen.
 * Kein Fehlerfall: der einzige Weg, denselben Code-Pfad zu fahren und trotzdem
 * nichts zu schreiben.
 */
class DryRunRollback extends Error {
  constructor(public readonly outcome: unknown) {
    super("dry-run");
    this.name = "DryRunRollback";
  }
}

async function runBatch<T>(
  ctx: TenantContext,
  dryRun: boolean,
  fn: (tx: TenantTx, emit: EmitFn) => Promise<BatchOutcome<T>>,
): Promise<BatchOutcome<T>> {
  try {
    return await withDomainEvents(ctx, async (tx, emit) => {
      const outcome = await fn(tx, emit);
      // Rollback NACH allen Schreibvorgängen: Constraints und Regeln haben
      // damit real gegriffen. withDomainEvents veröffentlicht wegen des Wurfs
      // keine Ereignisse.
      if (dryRun) throw new DryRunRollback(outcome);
      return outcome;
    });
  } catch (err) {
    if (err instanceof DryRunRollback) return err.outcome as BatchOutcome<T>;
    throw err;
  }
}

// ── Hilfen ────────────────────────────────────────────────────────────────

const WEEKDAY_CODES: readonly string[] = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];

/** work_days ist JSON; hier auf das erwartete Vokabular eingegrenzt. */
function toWeekDays(value: Prisma.JsonValue): WeekDay[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is WeekDay => typeof v === "string" && WEEKDAY_CODES.includes(v));
}

function unique<T>(values: readonly T[]): T[] {
  return [...new Set(values)];
}

/**
 * Lesen im Tenant-Kontext (RLS). Bewusst nicht withDomainEvents: eine Abfrage
 * erzeugt keine Ereignisse, und das soll an der Aufrufstelle sichtbar sein.
 */
function withTenantRead<T>(ctx: TenantContext, fn: (tx: TenantTx) => Promise<T>): Promise<T> {
  return withTenant(ctx.organizationId, fn);
}

function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

function weekKey(caregiverId: string, date: Date): string {
  return `${caregiverId}|${dayKey(startOfISOWeek(date))}`;
}

/** IDs der Fachkräfte des Lots, die es im Tenant wirklich gibt. */
async function knownCaregiverIds(
  tx: TenantTx,
  ctx: TenantContext,
  ids: readonly string[],
): Promise<Set<string>> {
  const rows = await tx.caregiver.findMany({
    where: { organizationId: ctx.organizationId, id: { in: [...ids] } },
    select: { id: true },
  });
  return new Set(rows.map((r) => r.id));
}

interface ExternalRef {
  externalId?: string;
  externalSource: ExternalSource;
}

function externalKey(item: ExternalRef): string | null {
  return item.externalId ? `${item.externalSource}|${item.externalId}` : null;
}

/**
 * Zieht die Vertrags-Momentaufnahme auf der Fachkraft nach (contract_type,
 * weekly_hours, work_days, max_patients). Quelle der Wahrheit bleibt die
 * Vertragstabelle; Planung und VRPTW lesen weiterhin die Fachkraft.
 */
async function syncContractSnapshot(
  tx: TenantTx,
  ctx: TenantContext,
  caregiverId: string,
  today: Date,
): Promise<void> {
  const contracts = await tx.contract.findMany({
    where: { organizationId: ctx.organizationId, caregiverId },
    select: {
      validFrom: true,
      validUntil: true,
      contractType: true,
      weeklyHours: true,
      workDays: true,
      maxPatients: true,
    },
  });

  const current = activeAt(
    contracts.map((c) => ({ ...c, start: c.validFrom, end: c.validUntil })),
    today,
  );
  if (!current) return; // kein geltender Vertrag: Momentaufnahme unverändert lassen

  await tx.caregiver.update({
    where: { id: caregiverId },
    data: {
      contractType: current.contractType,
      weeklyHours: current.weeklyHours,
      workDays: current.workDays as Prisma.InputJsonValue,
      maxPatients: current.maxPatients,
    },
  });
}

// ── Geltender Vertrag (Vertragsmodul der Fachkraft) ───────────────────────

/** Vertragsdaten, wie sie das Vertragsformular einer Fachkraft liefert. */
export interface ContractChangeInput {
  contractType: ContractItemInput["contractType"];
  weeklyHours: number;
  workDays: string[];
  maxPatients: number;
  /** Stichtag der Änderung; ohne Angabe ab heute. */
  validFrom?: Date;
}

/**
 * Setzt den zum Stichtag geltenden Vertrag einer Fachkraft. Läuft INNERHALB
 * einer bestehenden Transaktion, damit Aufrufer (Fachkraft anlegen,
 * Vertragsmodul) ihre eigene Klammer behalten.
 *
 * Drei Fälle, ein Zeitstrahl:
 *   - Stichtag = Beginn des geltenden Vertrags -> Korrektur desselben Satzes.
 *   - Es gibt einen geltenden Vertrag -> er endet am Vortag, eine neue Version
 *     beginnt am Stichtag.
 *   - Existiert bereits ein SPÄTERER Vertrag, wird die neue Version an dessen
 *     Vortag begrenzt, statt mit ihm zu kollidieren. Eine Änderung "ab heute"
 *     überschreibt also keine bereits vereinbarte Zukunft.
 */
export async function applyContractChange(
  tx: TenantTx,
  ctx: TenantContext,
  caregiverId: string,
  input: ContractChangeInput,
  emit: EmitFn,
): Promise<{ contractId: string }> {
  const validFrom = input.validFrom ?? startOfUtcDay(new Date());

  const rows = await tx.contract.findMany({
    where: { organizationId: ctx.organizationId, caregiverId },
    select: { id: true, validFrom: true, validUntil: true },
  });
  const periods = rows.map((r) => ({ id: r.id, start: r.validFrom, end: r.validUntil }));
  const active = activeAt(periods, validFrom);

  const fields = {
    contractType: input.contractType,
    weeklyHours: input.weeklyHours,
    workDays: input.workDays as Prisma.InputJsonValue,
    maxPatients: input.maxPatients,
  };

  if (active && dayKey(active.start) === dayKey(validFrom)) {
    const record = await tx.contract.update({ where: { id: active.id }, data: fields });
    emit({
      name: "contract.updated",
      entityType: "contract",
      entityId: record.id,
      payload: {
        caregiverId,
        contractType: input.contractType,
        weeklyHours: input.weeklyHours,
        validFrom: dayKey(validFrom),
      },
    });
    return { contractId: record.id };
  }

  if (active) {
    const endOfPrevious = addDays(validFrom, -1);
    await tx.contract.update({
      where: { id: active.id },
      data: { validUntil: endOfPrevious },
    });
    emit({
      name: "contract.ended",
      entityType: "contract",
      entityId: active.id,
      payload: { caregiverId, validUntil: dayKey(endOfPrevious) },
    });
  }

  const next = periods
    .filter((p) => p.id !== active?.id && p.start.getTime() > validFrom.getTime())
    .sort((a, b) => a.start.getTime() - b.start.getTime())[0];
  const validUntil = next ? addDays(next.start, -1) : null;

  // Verteidigung in der Tiefe: dieselbe Regel wie im Lot-Pfad, gegen den
  // bereits fortgeschriebenen Zeitstrahl geprüft.
  const others = periods
    .filter((p) => p.id !== active?.id)
    .concat(active ? [{ ...active, end: addDays(validFrom, -1) }] : []);
  const violations = contractViolations({ start: validFrom, end: validUntil }, others);
  if (violations.length > 0) {
    throw new AppError(409, violations.join("; "), "Conflict");
  }

  const record = await tx.contract.create({
    data: {
      organizationId: ctx.organizationId,
      caregiverId,
      ...fields,
      validFrom,
      validUntil,
    },
  });

  emit({
    name: "contract.created",
    entityType: "contract",
    entityId: record.id,
    payload: {
      caregiverId,
      contractType: input.contractType,
      weeklyHours: input.weeklyHours,
      validFrom: dayKey(validFrom),
      validUntil: validUntil ? dayKey(validUntil) : null,
    },
  });

  return { contractId: record.id };
}

/**
 * Vertragsmodul einer Fachkraft (PUT /caregivers/:id/contract). Schreibt eine
 * Vertragsversion und zieht die Momentaufnahme nach; gibt die Fachkraft
 * zurück, wie es die Oberfläche erwartet.
 */
export async function setActiveContract(
  ctx: TenantContext,
  caregiverId: string,
  input: ContractChangeInput,
): Promise<unknown> {
  return withDomainEvents(ctx, async (tx, emit) => {
    const caregiver = await tx.caregiver.findFirst({
      where: { id: caregiverId, organizationId: ctx.organizationId },
      select: { id: true },
    });
    if (!caregiver) throw new AppError(404, "Fachkraft nicht gefunden", "NotFound");

    const { contractId } = await applyContractChange(tx, ctx, caregiverId, input, emit);
    await syncContractSnapshot(tx, ctx, caregiverId, new Date());

    await writeAudit(tx, ctx, {
      action: AuditAction.UPDATE,
      entityType: "hr_contract",
      entityId: contractId,
      metadata: {
        caregiverId,
        contractType: input.contractType,
        weeklyHours: input.weeklyHours,
        validFrom: dayKey(input.validFrom ?? startOfUtcDay(new Date())),
      },
    });

    return tx.caregiver.findFirstOrThrow({ where: { id: caregiverId } });
  });
}

// ── Verträge ──────────────────────────────────────────────────────────────

export async function upsertContracts(
  ctx: TenantContext,
  input: ContractBatchInput,
): Promise<BatchOutcome<unknown>> {
  const { items, dryRun } = input;

  return runBatch(ctx, dryRun, async (tx, emit) => {
    const caregiverIds = unique(items.map((i) => i.caregiverId));
    const known = await knownCaregiverIds(tx, ctx, caregiverIds);

    const existing = await tx.contract.findMany({
      where: { organizationId: ctx.organizationId, caregiverId: { in: caregiverIds } },
      select: {
        id: true,
        caregiverId: true,
        validFrom: true,
        validUntil: true,
        externalId: true,
        externalSource: true,
      },
    });

    // Arbeitsmenge der Gültigkeitszeiträume je Fachkraft: wächst mit dem Lot,
    // damit zwei Zeilen DESSELBEN Imports sich nicht überschneiden können.
    const periods = new Map<string, (Period & { id: string })[]>();
    for (const c of existing) {
      const list = periods.get(c.caregiverId) ?? [];
      list.push({ id: c.id, start: c.validFrom, end: c.validUntil });
      periods.set(c.caregiverId, list);
    }

    const applied: BatchApplied<unknown>[] = [];
    const rejected: BatchRejection[] = [];
    const seenExternal = new Set<string>();
    let created = 0;
    let updated = 0;

    for (const [index, item] of items.entries()) {
      const reject = (reasons: string[]): void => {
        rejected.push({ index, caregiverId: item.caregiverId, externalId: item.externalId, reasons });
      };

      if (!known.has(item.caregiverId)) {
        reject(["Fachkraft nicht gefunden"]);
        continue;
      }

      const key = externalKey(item);
      if (key && seenExternal.has(key)) {
        reject(["Doppelte external_id im selben Lot"]);
        continue;
      }

      const match = key
        ? existing.find((c) => c.externalId === item.externalId && c.externalSource === item.externalSource)
        : existing.find(
            (c) =>
              c.caregiverId === item.caregiverId &&
              c.externalId === null &&
              dayKey(c.validFrom) === dayKey(item.validFrom),
          );

      if (match && match.caregiverId !== item.caregiverId) {
        reject(["external_id gehört zu einer anderen Fachkraft"]);
        continue;
      }

      const others = (periods.get(item.caregiverId) ?? []).filter((p) => p.id !== match?.id);
      const violations = contractViolations({ start: item.validFrom, end: item.validUntil }, others);
      if (violations.length > 0) {
        reject(violations);
        continue;
      }

      const data = {
        caregiverId: item.caregiverId,
        contractType: item.contractType,
        weeklyHours: item.weeklyHours,
        workDays: item.workDays as Prisma.InputJsonValue,
        maxPatients: item.maxPatients,
        validFrom: item.validFrom,
        validUntil: item.validUntil,
        externalId: item.externalId ?? null,
        externalSource: item.externalSource,
      };

      const record = match
        ? await tx.contract.update({ where: { id: match.id }, data })
        : await tx.contract.create({ data: { organizationId: ctx.organizationId, ...data } });

      if (key) seenExternal.add(key);

      const list = (periods.get(item.caregiverId) ?? []).filter((p) => p.id !== record.id);
      list.push({ id: record.id, start: item.validFrom, end: item.validUntil });
      periods.set(item.caregiverId, list);

      if (match) updated += 1;
      else created += 1;

      emit({
        name: match ? "contract.updated" : "contract.created",
        entityType: "contract",
        entityId: record.id,
        payload: {
          caregiverId: item.caregiverId,
          contractType: item.contractType,
          weeklyHours: item.weeklyHours,
          validFrom: dayKey(item.validFrom),
          validUntil: item.validUntil ? dayKey(item.validUntil) : null,
          externalSource: item.externalSource,
        },
      });

      applied.push({
        index,
        id: record.id,
        caregiverId: item.caregiverId,
        action: match ? "updated" : "created",
        record,
      });
    }

    const today = new Date();
    for (const caregiverId of unique(applied.map((a) => a.caregiverId))) {
      await syncContractSnapshot(tx, ctx, caregiverId, today);
    }

    await writeAudit(tx, ctx, {
      action: AuditAction.UPDATE,
      entityType: "hr_contract_batch",
      metadata: { total: items.length, created, updated, rejected: rejected.length, dryRun },
    });

    return {
      dryRun,
      applied,
      rejected,
      summary: { total: items.length, created, updated, rejected: rejected.length },
    };
  });
}

/** Beendet einen laufenden Vertrag zum angegebenen Datum. */
export async function endContract(
  ctx: TenantContext,
  id: string,
  input: EndContractInput,
): Promise<unknown> {
  return withDomainEvents(ctx, async (tx, emit) => {
    const contract = await tx.contract.findFirst({
      where: { id, organizationId: ctx.organizationId },
      select: { id: true, caregiverId: true, validFrom: true },
    });
    if (!contract) throw new AppError(404, "Vertrag nicht gefunden", "NotFound");

    if (input.validUntil.getTime() < contract.validFrom.getTime()) {
      throw new AppError(422, "Vertragsende liegt vor dem Vertragsbeginn", "UnprocessableEntity");
    }

    const record = await tx.contract.update({
      where: { id },
      data: { validUntil: input.validUntil },
    });

    await syncContractSnapshot(tx, ctx, contract.caregiverId, new Date());
    await writeAudit(tx, ctx, {
      action: AuditAction.UPDATE,
      entityType: "hr_contract",
      entityId: id,
      metadata: { validUntil: dayKey(input.validUntil) },
    });

    emit({
      name: "contract.ended",
      entityType: "contract",
      entityId: id,
      payload: { caregiverId: contract.caregiverId, validUntil: dayKey(input.validUntil) },
    });

    return record;
  });
}

export async function listContracts(
  ctx: TenantContext,
  query: ListContractsQuery,
): Promise<Paginated<unknown>> {
  return withTenantRead(ctx, async (tx) => {
    const where: Prisma.ContractWhereInput = {
      organizationId: ctx.organizationId,
      ...(query.caregiverId ? { caregiverId: query.caregiverId } : {}),
      ...(query.updatedSince ? { updatedAt: { gte: query.updatedSince } } : {}),
      ...(query.activeOn
        ? {
            validFrom: { lte: query.activeOn },
            OR: [{ validUntil: null }, { validUntil: { gte: query.activeOn } }],
          }
        : {}),
    };

    const [data, total] = await Promise.all([
      tx.contract.findMany({ where, orderBy: { validFrom: "desc" }, ...toSkipTake(query) }),
      tx.contract.count({ where }),
    ]);
    return paginated(data, total, query);
  });
}

// ── Dienstpläne ───────────────────────────────────────────────────────────

interface WorkingShift {
  id: string;
  caregiverId: string;
  date: Date;
  startMinute: number;
  endMinute: number;
  breakMinutes: number;
}

export async function upsertSchedules(
  ctx: TenantContext,
  input: ScheduleBatchInput,
): Promise<BatchOutcome<unknown>> {
  const { items, dryRun } = input;

  return runBatch(ctx, dryRun, async (tx, emit) => {
    const caregiverIds = unique(items.map((i) => i.caregiverId));
    const known = await knownCaregiverIds(tx, ctx, caregiverIds);

    const times = items.map((i) => i.date.getTime());
    const rangeStart = startOfISOWeek(new Date(Math.min(...times)));
    const rangeEnd = weekRange(new Date(Math.max(...times))).end;

    const [existing, contracts, absences] = await Promise.all([
      tx.workSchedule.findMany({
        where: {
          organizationId: ctx.organizationId,
          caregiverId: { in: caregiverIds },
          date: { gte: rangeStart, lt: rangeEnd },
        },
      }),
      tx.contract.findMany({
        where: { organizationId: ctx.organizationId, caregiverId: { in: caregiverIds } },
        select: {
          caregiverId: true,
          validFrom: true,
          validUntil: true,
          weeklyHours: true,
          workDays: true,
        },
      }),
      // Genehmigte Abwesenheiten blockieren die Planung.
      tx.absence.findMany({
        where: {
          organizationId: ctx.organizationId,
          caregiverId: { in: caregiverIds },
          status: AbsenceStatus.APPROVED,
          startDate: { lt: rangeEnd },
          endDate: { gte: rangeStart },
        },
        select: { caregiverId: true, startDate: true, endDate: true },
      }),
    ]);

    // Arbeitsmenge: bestehende Schichten + die des Lots, für die Wochenbilanz.
    const shifts = new Map<string, WorkingShift>();
    const naturalKey = (caregiverId: string, date: Date, startMinute: number): string =>
      `${caregiverId}|${dayKey(date)}|${startMinute}`;
    for (const s of existing) {
      shifts.set(naturalKey(s.caregiverId, s.date, s.startMinute), {
        id: s.id,
        caregiverId: s.caregiverId,
        date: s.date,
        startMinute: s.startMinute,
        endMinute: s.endMinute,
        breakMinutes: s.breakMinutes,
      });
    }

    const contractsByCaregiver = new Map<string, (ContractRule & Period)[]>();
    for (const c of contracts) {
      const list = contractsByCaregiver.get(c.caregiverId) ?? [];
      list.push({
        start: c.validFrom,
        end: c.validUntil,
        weeklyHours: Number(c.weeklyHours),
        workDays: toWeekDays(c.workDays),
      });
      contractsByCaregiver.set(c.caregiverId, list);
    }

    const applied: BatchApplied<unknown>[] = [];
    const rejected: BatchRejection[] = [];
    const seenKeys = new Set<string>();
    let created = 0;
    let updated = 0;

    for (const [index, item] of items.entries()) {
      const reject = (reasons: string[]): void => {
        rejected.push({ index, caregiverId: item.caregiverId, externalId: item.externalId, reasons });
      };

      if (!known.has(item.caregiverId)) {
        reject(["Fachkraft nicht gefunden"]);
        continue;
      }

      const key = externalKey(item) ?? naturalKey(item.caregiverId, item.date, item.start);
      if (seenKeys.has(key)) {
        reject(["Doppelter Schlüssel im selben Lot"]);
        continue;
      }

      const match = item.externalId
        ? existing.find(
            (s) => s.externalId === item.externalId && s.externalSource === item.externalSource,
          )
        : existing.find(
            (s) =>
              s.caregiverId === item.caregiverId &&
              dayKey(s.date) === dayKey(item.date) &&
              s.startMinute === item.start,
          );

      const contract = activeAt(contractsByCaregiver.get(item.caregiverId) ?? [], item.date) ?? null;

      // Bereits verplante Netto-Zeit derselben Woche, ohne die ersetzte Schicht.
      const targetWeek = weekKey(item.caregiverId, item.date);
      let otherWeekMinutes = 0;
      for (const shift of shifts.values()) {
        if (shift.id === match?.id) continue;
        if (weekKey(shift.caregiverId, shift.date) !== targetWeek) continue;
        otherWeekMinutes += netWorkMinutes(shift);
      }

      const violations = scheduleViolations(
        {
          date: item.date,
          startMinute: item.start,
          endMinute: item.end,
          breakMinutes: item.breakMinutes,
        },
        contract,
        otherWeekMinutes,
      );

      const blocking = absences.find(
        (a) =>
          a.caregiverId === item.caregiverId &&
          a.startDate.getTime() <= item.date.getTime() &&
          item.date.getTime() <= a.endDate.getTime(),
      );
      if (blocking) violations.push("Genehmigte Abwesenheit an diesem Tag");

      if (violations.length > 0) {
        reject(violations);
        continue;
      }

      const data = {
        caregiverId: item.caregiverId,
        date: item.date,
        startMinute: item.start,
        endMinute: item.end,
        breakMinutes: item.breakMinutes,
        note: item.note ?? null,
        externalId: item.externalId ?? null,
        externalSource: item.externalSource,
      };

      const record = match
        ? await tx.workSchedule.update({ where: { id: match.id }, data })
        : await tx.workSchedule.create({ data: { organizationId: ctx.organizationId, ...data } });

      seenKeys.add(key);
      // Alte natürliche Position entfernen (die Startzeit kann sich geändert haben).
      if (match) shifts.delete(naturalKey(match.caregiverId, match.date, match.startMinute));
      shifts.set(naturalKey(item.caregiverId, item.date, item.start), {
        id: record.id,
        caregiverId: item.caregiverId,
        date: item.date,
        startMinute: item.start,
        endMinute: item.end,
        breakMinutes: item.breakMinutes,
      });

      if (match) updated += 1;
      else created += 1;

      emit({
        name: "schedule.upserted",
        entityType: "work_schedule",
        entityId: record.id,
        payload: {
          caregiverId: item.caregiverId,
          date: dayKey(item.date),
          startMinute: item.start,
          endMinute: item.end,
          breakMinutes: item.breakMinutes,
          netMinutes: netWorkMinutes({
            startMinute: item.start,
            endMinute: item.end,
            breakMinutes: item.breakMinutes,
          }),
          externalSource: item.externalSource,
        },
      });

      applied.push({
        index,
        id: record.id,
        caregiverId: item.caregiverId,
        action: match ? "updated" : "created",
        record,
      });
    }

    await writeAudit(tx, ctx, {
      action: AuditAction.UPDATE,
      entityType: "hr_schedule_batch",
      metadata: { total: items.length, created, updated, rejected: rejected.length, dryRun },
    });

    return {
      dryRun,
      applied,
      rejected,
      summary: { total: items.length, created, updated, rejected: rejected.length },
    };
  });
}

export async function deleteSchedule(ctx: TenantContext, id: string): Promise<void> {
  await withDomainEvents(ctx, async (tx, emit) => {
    const schedule = await tx.workSchedule.findFirst({
      where: { id, organizationId: ctx.organizationId },
      select: { id: true, caregiverId: true, date: true },
    });
    if (!schedule) throw new AppError(404, "Dienstplan-Eintrag nicht gefunden", "NotFound");

    await tx.workSchedule.delete({ where: { id } });
    await writeAudit(tx, ctx, {
      action: AuditAction.DELETE,
      entityType: "hr_schedule",
      entityId: id,
    });

    emit({
      name: "schedule.deleted",
      entityType: "work_schedule",
      entityId: id,
      payload: { caregiverId: schedule.caregiverId, date: dayKey(schedule.date) },
    });
  });
}

export async function listSchedules(
  ctx: TenantContext,
  query: ListSchedulesQuery,
): Promise<Paginated<unknown>> {
  return withTenantRead(ctx, async (tx) => {
    const where: Prisma.WorkScheduleWhereInput = {
      organizationId: ctx.organizationId,
      ...(query.caregiverId ? { caregiverId: query.caregiverId } : {}),
      ...(query.updatedSince ? { updatedAt: { gte: query.updatedSince } } : {}),
      ...(query.from || query.to
        ? {
            date: {
              ...(query.from ? { gte: query.from } : {}),
              ...(query.to ? { lte: query.to } : {}),
            },
          }
        : {}),
    };

    const [data, total] = await Promise.all([
      tx.workSchedule.findMany({
        where,
        orderBy: [{ date: "asc" }, { startMinute: "asc" }],
        ...toSkipTake(query),
      }),
      tx.workSchedule.count({ where }),
    ]);
    return paginated(data, total, query);
  });
}

// ── Abwesenheiten ─────────────────────────────────────────────────────────

export async function upsertAbsences(
  ctx: TenantContext,
  input: AbsenceBatchInput,
): Promise<BatchOutcome<unknown>> {
  const { items, dryRun } = input;

  return runBatch(ctx, dryRun, async (tx, emit) => {
    const caregiverIds = unique(items.map((i) => i.caregiverId));
    const known = await knownCaregiverIds(tx, ctx, caregiverIds);

    const existing = await tx.absence.findMany({
      where: {
        organizationId: ctx.organizationId,
        caregiverId: { in: caregiverIds },
        status: { in: [AbsenceStatus.REQUESTED, AbsenceStatus.APPROVED] },
      },
      select: {
        id: true,
        caregiverId: true,
        startDate: true,
        endDate: true,
        externalId: true,
        externalSource: true,
      },
    });

    const periods = new Map<string, (Period & { id: string })[]>();
    for (const a of existing) {
      const list = periods.get(a.caregiverId) ?? [];
      list.push({ id: a.id, start: a.startDate, end: a.endDate });
      periods.set(a.caregiverId, list);
    }

    const applied: BatchApplied<unknown>[] = [];
    const rejected: BatchRejection[] = [];
    const seenExternal = new Set<string>();
    let created = 0;
    let updated = 0;

    for (const [index, item] of items.entries()) {
      const reject = (reasons: string[]): void => {
        rejected.push({ index, caregiverId: item.caregiverId, externalId: item.externalId, reasons });
      };

      if (!known.has(item.caregiverId)) {
        reject(["Fachkraft nicht gefunden"]);
        continue;
      }

      const key = externalKey(item);
      if (key && seenExternal.has(key)) {
        reject(["Doppelte external_id im selben Lot"]);
        continue;
      }

      const match = key
        ? existing.find(
            (a) => a.externalId === item.externalId && a.externalSource === item.externalSource,
          )
        : undefined;

      if (match && match.caregiverId !== item.caregiverId) {
        reject(["external_id gehört zu einer anderen Fachkraft"]);
        continue;
      }

      const others = (periods.get(item.caregiverId) ?? []).filter((p) => p.id !== match?.id);
      const violations = absenceViolations(
        { startDate: item.startDate, endDate: item.endDate },
        others,
      );
      if (violations.length > 0) {
        reject(violations);
        continue;
      }

      const data = {
        caregiverId: item.caregiverId,
        type: item.type,
        startDate: item.startDate,
        endDate: item.endDate,
        reason: item.reason ?? null,
        externalId: item.externalId ?? null,
        externalSource: item.externalSource,
      };

      const record = match
        ? await tx.absence.update({ where: { id: match.id }, data })
        : await tx.absence.create({ data: { organizationId: ctx.organizationId, ...data } });

      if (key) seenExternal.add(key);

      const list = (periods.get(item.caregiverId) ?? []).filter((p) => p.id !== record.id);
      list.push({ id: record.id, start: item.startDate, end: item.endDate });
      periods.set(item.caregiverId, list);

      if (match) updated += 1;
      else created += 1;

      emit({
        name: match ? "absence.updated" : "absence.created",
        entityType: "absence",
        entityId: record.id,
        payload: {
          caregiverId: item.caregiverId,
          type: item.type,
          startDate: dayKey(item.startDate),
          endDate: dayKey(item.endDate),
          externalSource: item.externalSource,
        },
      });

      applied.push({
        index,
        id: record.id,
        caregiverId: item.caregiverId,
        action: match ? "updated" : "created",
        record,
      });
    }

    await writeAudit(tx, ctx, {
      action: AuditAction.UPDATE,
      entityType: "hr_absence_batch",
      metadata: { total: items.length, created, updated, rejected: rejected.length, dryRun },
    });

    return {
      dryRun,
      applied,
      rejected,
      summary: { total: items.length, created, updated, rejected: rejected.length },
    };
  });
}

/** Endzustände, in die eine Abwesenheit bewusst überführt wird. */
export type AbsenceDecision = Extract<AbsenceStatus, "APPROVED" | "REJECTED" | "CANCELED">;

/** Zulässige Statuswechsel: aus welchem Zustand heraus eine Entscheidung gilt. */
const ALLOWED_TRANSITIONS: Record<AbsenceDecision, AbsenceStatus[]> = {
  APPROVED: [AbsenceStatus.REQUESTED],
  REJECTED: [AbsenceStatus.REQUESTED],
  // Zurückziehen geht auch nach der Genehmigung (Urlaub abgesagt).
  CANCELED: [AbsenceStatus.REQUESTED, AbsenceStatus.APPROVED],
};

const DECISION_EVENT: Record<AbsenceDecision, DomainEventName> = {
  APPROVED: "absence.approved",
  REJECTED: "absence.rejected",
  CANCELED: "absence.canceled",
};

export async function decideAbsence(
  ctx: TenantContext,
  id: string,
  decision: AbsenceDecision,
  input: AbsenceDecisionInput,
): Promise<unknown> {
  return withDomainEvents(ctx, async (tx, emit) => {
    const absence = await tx.absence.findFirst({
      where: { id, organizationId: ctx.organizationId },
      select: { id: true, caregiverId: true, status: true, type: true, startDate: true, endDate: true },
    });
    if (!absence) throw new AppError(404, "Abwesenheit nicht gefunden", "NotFound");

    if (!ALLOWED_TRANSITIONS[decision].includes(absence.status)) {
      throw new AppError(
        409,
        `Statuswechsel von ${absence.status} nach ${decision} ist nicht zulässig`,
        "Conflict",
      );
    }

    const record = await tx.absence.update({
      where: { id },
      data: {
        status: decision,
        decidedByUserId: ctx.userId,
        decidedAt: new Date(),
        ...(input.reason ? { reason: input.reason } : {}),
      },
    });

    await writeAudit(tx, ctx, {
      action: AuditAction.UPDATE,
      entityType: "hr_absence",
      entityId: id,
      metadata: { from: absence.status, to: decision },
    });

    emit({
      name: DECISION_EVENT[decision],
      entityType: "absence",
      entityId: id,
      payload: {
        caregiverId: absence.caregiverId,
        type: absence.type,
        startDate: dayKey(absence.startDate),
        endDate: dayKey(absence.endDate),
        previousStatus: absence.status,
      },
    });

    return record;
  });
}

export async function listAbsences(
  ctx: TenantContext,
  query: ListAbsencesQuery,
): Promise<Paginated<unknown>> {
  return withTenantRead(ctx, async (tx) => {
    const where: Prisma.AbsenceWhereInput = {
      organizationId: ctx.organizationId,
      ...(query.caregiverId ? { caregiverId: query.caregiverId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.updatedSince ? { updatedAt: { gte: query.updatedSince } } : {}),
      // Überlappung mit dem Abfragefenster, nicht nur Startdatum darin.
      ...(query.to ? { startDate: { lte: query.to } } : {}),
      ...(query.from ? { endDate: { gte: query.from } } : {}),
    };

    const [data, total] = await Promise.all([
      tx.absence.findMany({ where, orderBy: { startDate: "desc" }, ...toSkipTake(query) }),
      tx.absence.count({ where }),
    ]);
    return paginated(data, total, query);
  });
}

