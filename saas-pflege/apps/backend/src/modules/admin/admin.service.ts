import {
  AuditAction,
  Prisma,
  SubscriptionStatus,
  prisma,
  type SubscriptionPlan,
} from "@len-len/database";
import { AppError, ConflictError } from "../../lib/errors.js";
import { paginated, toSkipTake, type Paginated } from "../../lib/pagination.js";
import { getBillingProvider } from "../../lib/billing/index.js";
import type { RecurringRevenue } from "../../lib/billing/types.js";
import { daysAgo, fillStatusCounts, toCsv, trialAlertWindow, type StatusCounts } from "./admin.rules.js";
import type {
  AuditLogExportQuery,
  AuditLogQuery,
  DeleteOrganizationInput,
  ListOrganizationsQuery,
  UpdateOrganizationInput,
} from "./admin.schemas.js";

/**
 * Super-Admin-Panel.
 *
 * ALLE Abfragen hier laufen über `prisma` (Systempfad, Eigentümerrolle) und
 * NICHT über `withTenant`. Das ist der Zweck des Panels: über Organisationen
 * hinweg lesen. Es heisst aber auch, dass die RLS hier nichts auffängt – der
 * Wächter `requireSuperAdmin` ist die einzige Schicht. Wer in dieser Datei
 * etwas ergänzt, prüft zuerst, ob die Route unter /admin hängt.
 *
 * Gelöschte Organisationen (`deletedAt`) sind überall ausgeblendet, sofern
 * nicht ausdrücklich angefordert.
 */

/** Kontext des handelnden Super-Admins. */
export interface AdminContext {
  userId: string;
}

const NOT_DELETED = { deletedAt: null } satisfies Prisma.OrganizationWhereInput;

/**
 * Audit-Eintrag einer Super-Admin-Aktion.
 *
 * Bewusst an der BETROFFENEN Organisation, nicht an der des Super-Admins: wer
 * später die Geschichte eines Kunden liest, muss dort sehen, was von aussen an
 * ihm geändert wurde. `userId` bleibt der Super-Admin – dass er einer anderen
 * Organisation angehört, ist genau die Information, die den Eingriff kenntlich
 * macht.
 */
async function writeAdminAudit(
  organizationId: string,
  ctx: AdminContext,
  entry: { action: AuditAction; entityId: string; metadata: Prisma.InputJsonValue },
): Promise<void> {
  await prisma.auditLog.create({
    data: {
      organizationId,
      userId: ctx.userId,
      action: entry.action,
      entityType: "organization",
      entityId: entry.entityId,
      metadata: entry.metadata,
    },
  });
}

// ── Dashboard ──────────────────────────────────────────────────────────────

export interface AdminDashboard {
  organizations: { total: number; byStatus: StatusCounts };
  revenue: RecurringRevenue & { available: boolean };
  growth: { last7Days: number; last30Days: number };
  alerts: {
    trialsEndingSoon: { id: string; name: string; trialEndsAt: Date | null }[];
    paymentFailures: { id: string; name: string; pastDueSince: Date | null }[];
  };
}

export async function getDashboard(now: Date = new Date()): Promise<AdminDashboard> {
  const { from, to } = trialAlertWindow(now);

  const [grouped, total, last7Days, last30Days, trialsEndingSoon, paymentFailures] =
    await Promise.all([
      prisma.organization.groupBy({
        by: ["subscriptionStatus"],
        where: NOT_DELETED,
        _count: { _all: true },
      }),
      prisma.organization.count({ where: NOT_DELETED }),
      prisma.organization.count({ where: { ...NOT_DELETED, createdAt: { gte: daysAgo(now, 7) } } }),
      prisma.organization.count({ where: { ...NOT_DELETED, createdAt: { gte: daysAgo(now, 30) } } }),
      prisma.organization.findMany({
        where: {
          ...NOT_DELETED,
          subscriptionStatus: SubscriptionStatus.TRIAL,
          trialEndsAt: { gte: from, lte: to },
        },
        select: { id: true, name: true, trialEndsAt: true },
        orderBy: { trialEndsAt: "asc" },
      }),
      prisma.organization.findMany({
        where: { ...NOT_DELETED, pastDueSince: { not: null } },
        select: { id: true, name: true, pastDueSince: true },
        orderBy: { pastDueSince: "asc" },
      }),
    ]);

  // Stripe darf das Dashboard nicht mitreissen: fällt der Aufruf aus (Netz,
  // Schlüssel, Rate Limit), fehlt der Umsatz und der Rest steht trotzdem.
  // `available: false` sagt der Oberfläche, dass sie nicht 0 € anzeigen soll.
  let revenue: RecurringRevenue & { available: boolean };
  try {
    revenue = { ...(await getBillingProvider().getRecurringRevenue()), available: true };
  } catch {
    revenue = {
      amountCents: 0,
      currency: "eur",
      subscriptions: 0,
      truncated: false,
      available: false,
    };
  }

  return {
    organizations: {
      total,
      byStatus: fillStatusCounts(
        grouped.map((g) => ({ status: g.subscriptionStatus, count: g._count._all })),
      ),
    },
    revenue,
    growth: { last7Days, last30Days },
    alerts: { trialsEndingSoon, paymentFailures },
  };
}

// ── Organisationen ─────────────────────────────────────────────────────────

const ORGANIZATION_LIST_SELECT = {
  id: true,
  name: true,
  country: true,
  subscriptionPlan: true,
  subscriptionStatus: true,
  trialEndsAt: true,
  pastDueSince: true,
  deletedAt: true,
  createdAt: true,
} satisfies Prisma.OrganizationSelect;

export async function listOrganizations(query: ListOrganizationsQuery): Promise<Paginated<unknown>> {
  const where: Prisma.OrganizationWhereInput = {
    ...(query.includeDeleted ? {} : NOT_DELETED),
    ...(query.status ? { subscriptionStatus: query.status } : {}),
    ...(query.plan ? { subscriptionPlan: query.plan } : {}),
    ...(query.search ? { name: { contains: query.search, mode: "insensitive" } } : {}),
  };

  const [data, total] = await Promise.all([
    prisma.organization.findMany({
      where,
      select: {
        ...ORGANIZATION_LIST_SELECT,
        _count: { select: { users: true, patients: true, caregivers: true } },
      },
      orderBy: { createdAt: "desc" },
      ...toSkipTake(query),
    }),
    prisma.organization.count({ where }),
  ]);

  return paginated(data, total, query);
}

/** Fiche complète : Organisation, letzte Rechnungen, letzte Audit-Einträge. */
export async function getOrganization(id: string): Promise<unknown> {
  const organization = await prisma.organization.findUnique({
    where: { id },
    select: {
      ...ORGANIZATION_LIST_SELECT,
      planLimits: true,
      stripeCustomerId: true,
      stripeSubscriptionId: true,
      deletionReason: true,
      deletedByUserId: true,
      updatedAt: true,
      _count: { select: { users: true, patients: true, caregivers: true, visits: true } },
    },
  });
  if (!organization) throw new AppError(404, "Organisation nicht gefunden", "NotFound");

  const [invoices, auditLogs] = await Promise.all([
    // Aus der eigenen Tabelle, nicht per Stripe-Roundtrip: sie ist genau dafür
    // aus den Webhooks gespiegelt (siehe Kommentar am Modell Invoice), und die
    // Fiche soll auch dann laden, wenn Stripe gerade klemmt.
    prisma.invoice.findMany({
      where: { organizationId: id },
      orderBy: { issuedAt: "desc" },
      take: 5,
      select: {
        id: true,
        number: true,
        amountDue: true,
        amountPaid: true,
        currency: true,
        status: true,
        hostedInvoiceUrl: true,
        issuedAt: true,
      },
    }),
    prisma.auditLog.findMany({
      where: { organizationId: id },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        action: true,
        entityType: true,
        entityId: true,
        metadata: true,
        createdAt: true,
        user: { select: { id: true, email: true, role: true } },
      },
    }),
  ]);

  return { ...organization, invoices, auditLogs };
}

/** Lädt eine nicht gelöschte Organisation oder wirft. */
async function requireLiveOrganization(id: string) {
  const organization = await prisma.organization.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      subscriptionPlan: true,
      subscriptionStatus: true,
      trialEndsAt: true,
      deletedAt: true,
    },
  });
  if (!organization) throw new AppError(404, "Organisation nicht gefunden", "NotFound");
  if (organization.deletedAt) {
    throw new ConflictError("Organisation ist gelöscht und kann nicht geändert werden");
  }
  return organization;
}

export async function updateOrganization(
  ctx: AdminContext,
  id: string,
  input: UpdateOrganizationInput,
): Promise<unknown> {
  const before = await requireLiveOrganization(id);

  const data: Prisma.OrganizationUpdateInput = {};

  if (input.plan) {
    // NUR der Plan. `planLimits` bleibt unangetastet: die Spalte hält keine
    // Kopie der Plan-Grenzen, sondern AUSNAHMEN je Ressource (ausgehandelte
    // Sonderkontingente), die resolvePlanLimits über den Plan-Default legt.
    // Sie hier zu überschreiben würde einen ausgehandelten Deal beim ersten
    // Plan-Wechsel im Panel stillschweigend löschen.
    data.subscriptionPlan = input.plan;
  }
  if (input.trialEndsAt) {
    data.trialEndsAt = input.trialEndsAt;
    // Eine verlängerte Testphase impliziert, dass sie läuft. Ohne das bliebe
    // ein suspendierter Tenant suspendiert, und die Verlängerung wäre folgenlos.
    data.subscriptionStatus = SubscriptionStatus.TRIAL;
  }
  if (input.status) {
    data.subscriptionStatus = input.status;
  }
  if (input.reactivate) {
    data.subscriptionStatus = SubscriptionStatus.ACTIVE;
    // Die Karenzzeit endet mit der Reaktivierung, sonst suspendiert der
    // Billing-Worker beim nächsten Lauf erneut.
    data.pastDueSince = null;
  }

  const updated = await prisma.organization.update({
    where: { id },
    data,
    select: ORGANIZATION_LIST_SELECT,
  });

  await writeAdminAudit(id, ctx, {
    action: AuditAction.UPDATE,
    entityId: id,
    metadata: {
      bySuperAdmin: true,
      changes: input as unknown as Prisma.InputJsonValue,
      before: {
        plan: before.subscriptionPlan,
        status: before.subscriptionStatus,
        trialEndsAt: before.trialEndsAt?.toISOString() ?? null,
      },
    },
  });

  return updated;
}

/**
 * Weiche Löschung. Der Tenant verschwindet aus den Listen und niemand kann sich
 * mehr anmelden (siehe auth.service: die Abfrage schliesst gelöschte
 * Organisationen aus), die Daten bleiben liegen.
 */
export async function softDeleteOrganization(
  ctx: AdminContext,
  id: string,
  input: DeleteOrganizationInput,
): Promise<unknown> {
  const before = await requireLiveOrganization(id);

  const deleted = await prisma.organization.update({
    where: { id },
    data: {
      deletedAt: new Date(),
      deletionReason: input.reason,
      deletedByUserId: ctx.userId,
      // Auch fachlich stilllegen: die Plan-Prüfung (402) sperrt damit jeden
      // Schreibzugriff, falls doch irgendwo eine Sitzung offen ist.
      subscriptionStatus: SubscriptionStatus.CANCELED,
    },
    select: ORGANIZATION_LIST_SELECT,
  });

  await writeAdminAudit(id, ctx, {
    action: AuditAction.DELETE,
    entityId: id,
    metadata: {
      bySuperAdmin: true,
      reason: input.reason,
      before: { name: before.name, status: before.subscriptionStatus },
    },
  });

  return deleted;
}

// ── Audit-Log (global) ─────────────────────────────────────────────────────

function auditWhere(query: AuditLogQuery | AuditLogExportQuery): Prisma.AuditLogWhereInput {
  return {
    ...(query.organizationId ? { organizationId: query.organizationId } : {}),
    ...(query.userId ? { userId: query.userId } : {}),
    ...(query.action ? { action: query.action } : {}),
    ...(query.entityType ? { entityType: query.entityType } : {}),
    ...(query.from || query.to
      ? {
          createdAt: {
            ...(query.from ? { gte: query.from } : {}),
            ...(query.to ? { lte: query.to } : {}),
          },
        }
      : {}),
  };
}

const AUDIT_SELECT = {
  id: true,
  organizationId: true,
  action: true,
  entityType: true,
  entityId: true,
  metadata: true,
  ipAddress: true,
  createdAt: true,
  organization: { select: { name: true } },
  user: { select: { id: true, email: true, role: true } },
} satisfies Prisma.AuditLogSelect;

export async function listAuditLogs(query: AuditLogQuery): Promise<Paginated<unknown>> {
  const where = auditWhere(query);

  const [data, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      select: AUDIT_SELECT,
      orderBy: { createdAt: "desc" },
      ...toSkipTake(query),
    }),
    prisma.auditLog.count({ where }),
  ]);

  return paginated(data, total, query);
}

/** Derselbe Filter als CSV. Spalten bewusst flach, für Tabellenkalkulationen. */
export async function exportAuditLogsCsv(query: AuditLogExportQuery): Promise<string> {
  const rows = await prisma.auditLog.findMany({
    where: auditWhere(query),
    select: AUDIT_SELECT,
    orderBy: { createdAt: "desc" },
    take: query.limit,
  });

  return toCsv(
    [
      "createdAt",
      "organizationId",
      "organizationName",
      "userEmail",
      "userRole",
      "action",
      "entityType",
      "entityId",
      "ipAddress",
      "metadata",
    ],
    rows.map((r) => [
      r.createdAt.toISOString(),
      r.organizationId,
      r.organization?.name ?? "",
      r.user?.email ?? "",
      r.user?.role ?? "",
      r.action,
      r.entityType,
      r.entityId ?? "",
      r.ipAddress ?? "",
      r.metadata,
    ]),
  );
}

export type { SubscriptionPlan };
