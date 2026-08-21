import { apiFetch } from "./client";
import type { Paginated } from "./pagination";
import type { InvoiceStatus, SubscriptionPlan, SubscriptionStatus } from "./billing";
import type { UserRole } from "./auth";

/**
 * Super-Admin-Panel (/admin/*).
 *
 * Alle Endpunkte hier antworten nur einem SUPER_ADMIN; für jede andere Rolle
 * kommt 403. Die Oberfläche prüft die Rolle zusätzlich selbst, damit sie den
 * Bereich gar nicht erst anbietet – geschützt wird er aber im Backend.
 */

export type AuditAction = "CREATE" | "READ" | "UPDATE" | "DELETE" | "EXPORT" | "LOGIN" | "LOGOUT";

export interface AdminDashboard {
  organizations: {
    total: number;
    byStatus: Record<SubscriptionStatus, number>;
  };
  revenue: {
    amountCents: number;
    currency: string;
    subscriptions: number;
    /** true = Seitenlimit erreicht, der Betrag ist eine Untergrenze. */
    truncated: boolean;
    /** false = Stripe war nicht erreichbar; KEINE 0 € anzeigen. */
    available: boolean;
  };
  growth: { last7Days: number; last30Days: number };
  alerts: {
    trialsEndingSoon: { id: string; name: string; trialEndsAt: string | null }[];
    paymentFailures: { id: string; name: string; pastDueSince: string | null }[];
  };
}

export interface AdminOrganizationRow {
  id: string;
  name: string;
  country: string;
  subscriptionPlan: SubscriptionPlan;
  subscriptionStatus: SubscriptionStatus;
  trialEndsAt: string | null;
  pastDueSince: string | null;
  deletedAt: string | null;
  createdAt: string;
  _count: { users: number; patients: number; caregivers: number };
}

export interface AdminInvoice {
  id: string;
  number: string | null;
  amountDue: number;
  amountPaid: number;
  currency: string;
  status: InvoiceStatus;
  hostedInvoiceUrl: string | null;
  issuedAt: string;
}

export interface AdminAuditEntry {
  id: string;
  organizationId?: string;
  action: AuditAction;
  entityType: string;
  entityId: string | null;
  metadata: unknown;
  ipAddress?: string | null;
  createdAt: string;
  organization?: { name: string } | null;
  user: { id: string; email: string; role: UserRole } | null;
}

export interface AdminOrganizationDetail extends AdminOrganizationRow {
  planLimits: unknown;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  deletionReason: string | null;
  deletedByUserId: string | null;
  updatedAt: string;
  _count: { users: number; patients: number; caregivers: number; visits: number };
  invoices: AdminInvoice[];
  auditLogs: AdminAuditEntry[];
}

export interface ListOrganizationsParams {
  page?: number;
  pageSize?: number;
  status?: SubscriptionStatus;
  plan?: SubscriptionPlan;
  search?: string;
  includeDeleted?: boolean;
}

export interface UpdateOrganizationInput {
  plan?: SubscriptionPlan;
  /** ISO-Datum, muss in der Zukunft liegen. */
  trialEndsAt?: string;
  /** Nur von Hand vergebbare Zustände; ACTIVE/PAST_DUE gehören Stripe. */
  status?: "SUSPENDED" | "TRIAL";
  reactivate?: boolean;
}

export interface AuditLogParams {
  page?: number;
  pageSize?: number;
  organizationId?: string;
  userId?: string;
  action?: AuditAction;
  entityType?: string;
  from?: string;
  to?: string;
}

function query(params: Record<string, string | number | boolean | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") search.set(key, String(value));
  }
  const qs = search.toString();
  return qs ? `?${qs}` : "";
}

export async function adminDashboard(): Promise<AdminDashboard> {
  return apiFetch<AdminDashboard>("/admin/dashboard");
}

export async function adminListOrganizations(
  params: ListOrganizationsParams = {},
): Promise<Paginated<AdminOrganizationRow>> {
  return apiFetch<Paginated<AdminOrganizationRow>>(`/admin/organizations${query({ ...params })}`);
}

export async function adminGetOrganization(id: string): Promise<AdminOrganizationDetail> {
  return apiFetch<AdminOrganizationDetail>(`/admin/organizations/${id}`);
}

export async function adminUpdateOrganization(
  id: string,
  input: UpdateOrganizationInput,
): Promise<AdminOrganizationRow> {
  return apiFetch<AdminOrganizationRow>(`/admin/organizations/${id}`, {
    method: "PATCH",
    body: input,
  });
}

/** Was aus dem Abo des Tenants bei der Löschung geworden ist. */
export interface SubscriptionCancellation {
  /** Lag überhaupt ein Abo vor? */
  attempted: boolean;
  /** Beim Anbieter beendet (oder war es schon)? */
  canceled: boolean;
  /**
   * Gesetzt, wenn die Kündigung fehlschlug. Die Organisation IST dann gelöscht,
   * aber die Abbuchung läuft weiter – das muss die Oberfläche zeigen, sonst
   * bleibt es in einem Log stehen, das niemand liest.
   */
  error?: string;
}

export interface AdminDeletedOrganization extends AdminOrganizationRow {
  subscription: SubscriptionCancellation;
}

/**
 * Weiche Löschung. Die Begründung ist Pflicht (mindestens 10 Zeichen).
 * Beendet zugleich das Abo beim Zahlungsanbieter – das Ergebnis steht in
 * `subscription`.
 */
export async function adminDeleteOrganization(
  id: string,
  reason: string,
): Promise<AdminDeletedOrganization> {
  return apiFetch<AdminDeletedOrganization>(`/admin/organizations/${id}`, {
    method: "DELETE",
    body: { reason },
  });
}

export async function adminListAuditLogs(
  params: AuditLogParams = {},
): Promise<Paginated<AdminAuditEntry>> {
  return apiFetch<Paginated<AdminAuditEntry>>(`/admin/audit-logs${query({ ...params })}`);
}

/**
 * Lädt den gefilterten Audit-Log als CSV-Text.
 *
 * Bewusst über apiFetch und NICHT als Download-Link: ein `<a href>` trägt
 * keinen Authorization-Header, das Token müsste also in die URL – und landete
 * damit in jedem Zugriffslog, das die Adresse mitschneidet. Der Umweg über den
 * Speicher der Seite ist der Preis dafür; bei der Obergrenze von 10 000 Zeilen
 * bleibt er im einstelligen Megabyte-Bereich.
 *
 * Die Datei entsteht im Browser aus diesem Text (Blob + object URL).
 */
export async function adminExportAuditLogsCsv(
  params: Omit<AuditLogParams, "page" | "pageSize"> & { limit?: number } = {},
): Promise<string> {
  return apiFetch<string>(`/admin/audit-logs/export${query({ ...params })}`);
}
