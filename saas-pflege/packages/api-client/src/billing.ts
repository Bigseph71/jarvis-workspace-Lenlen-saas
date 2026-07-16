import { apiFetch } from "./client";

export type SubscriptionPlan = "BASIC" | "PRO" | "ENTERPRISE";
export type SubscriptionStatus = "ACTIVE" | "PAST_DUE" | "SUSPENDED" | "CANCELED";
export type InvoiceStatus = "PAID" | "OPEN" | "FAILED" | "VOID";

/** Locale der Rückkehr-URL nach Checkout/Portal (muss zu /de /en /fr passen). */
export type BillingLocale = "de" | "en" | "fr";

export interface PlanLimits {
  patients: number;
  caregivers: number;
  /** null = unbegrenzt (Enterprise-Fahrzeuge). */
  vehicles: number | null;
  ki: boolean;
}

export interface PlanUsage {
  patients: number;
  caregivers: number;
  vehicles: number;
}

/** Laufende Karenzzeit bei Zahlungsverzug (Regel 8). */
export interface GraceWindow {
  since: string;
  /** Zeitpunkt der automatischen Suspendierung. */
  deadline: string;
  daysRemaining: number;
}

export interface Subscription {
  plan: SubscriptionPlan;
  status: SubscriptionStatus;
  /** Effektive Limits des Tenants (ggf. ausgehandelte Overrides). */
  limits: PlanLimits;
  /** Katalog-Limits aller Pläne – Quelle der Wahrheit bleibt das Backend. */
  catalog: Record<SubscriptionPlan, PlanLimits>;
  usage: PlanUsage;
  /** null, solange die Zahlungen in Ordnung sind. */
  grace: GraceWindow | null;
  portalAvailable: boolean;
}

export interface Invoice {
  id: string;
  number: string | null;
  /** Beträge in Cent, wie von Stripe geliefert. */
  amountDue: number;
  amountPaid: number;
  currency: string;
  status: InvoiceStatus;
  hostedInvoiceUrl: string | null;
  invoicePdfUrl: string | null;
  issuedAt: string;
}

/** Abo-Status, Limits, Verbrauch und Karenzzeit des Tenants. */
export async function getSubscription(): Promise<Subscription> {
  return apiFetch<Subscription>("/billing/subscription");
}

/** Rechnungs-Historie, neueste zuerst. */
export async function listInvoices(limit?: number): Promise<{ data: Invoice[]; total: number }> {
  const query = limit != null ? `?limit=${limit}` : "";
  return apiFetch<{ data: Invoice[]; total: number }>(`/billing/invoices${query}`);
}

/**
 * Startet den Stripe-Checkout und liefert die Weiterleitungs-URL. Die Locale
 * bestimmt, wohin Stripe nach Abschluss zurückführt.
 */
export async function createCheckout(
  plan: SubscriptionPlan,
  locale: BillingLocale,
): Promise<{ url: string }> {
  return apiFetch<{ url: string }>("/billing/checkout", {
    method: "POST",
    body: { plan, locale },
  });
}

/** Öffnet das Stripe-Self-Service-Portal (Zahlungsmittel, Rechnungen, Kündigung). */
export async function createPortal(locale: BillingLocale): Promise<{ url: string }> {
  return apiFetch<{ url: string }>("/billing/portal", { method: "POST", body: { locale } });
}
