import {
  Prisma,
  SubscriptionStatus,
  prisma,
  withTenant,
  type InvoiceStatus,
  type SubscriptionPlan,
} from "@len-len/database";
import { env } from "../../config/env.js";
import { AppError } from "../../lib/errors.js";
import type { TenantContext } from "../../lib/context.js";
import { getBillingProvider, type BillingEvent } from "../../lib/billing/index.js";
import { PLAN_LIMITS, parsePlan, resolvePlanLimits, type PlanLimits } from "./plan.js";
import { mapEventToStatus, mapInvoiceStatus, mapSubscriptionStatus } from "./events.js";
import { graceDaysRemaining, graceDeadline } from "./grace.js";
import type { CheckoutInput, ListInvoicesInput, PortalInput } from "./billing.schemas.js";

/**
 * Basis für Rückkehr-URLs: das WEB-Frontend, NICHT die API. Stripe schickt den
 * Nutzer nach Checkout/Portal dorthin zurück – die Billing-Seite liegt im Web
 * unter /{locale}/billing.
 */
function billingUrl(locale: string, query = ""): string {
  return `${env.WEB_ORIGIN}/${locale}/billing${query}`;
}

/** Startet eine Stripe-Checkout-Session für den aktuellen Tenant. */
export async function createCheckout(
  ctx: TenantContext,
  input: CheckoutInput,
): Promise<{ url: string }> {
  const session = await getBillingProvider().createCheckoutSession({
    organizationId: ctx.organizationId,
    plan: input.plan,
    successUrl: billingUrl(input.locale, "?checkout=success"),
    cancelUrl: billingUrl(input.locale, "?checkout=cancel"),
  });
  return { url: session.url };
}

export interface SubscriptionView {
  plan: SubscriptionPlan;
  status: SubscriptionStatus;
  /** Effektive Limits des Tenants (Plan-Default, ggf. per planLimits überschrieben). */
  limits: PlanLimits;
  /**
   * Katalog-Limits ALLER Pläne, damit das Frontend die Plan-Auswahl darstellen
   * kann, ohne die Tabelle aus CLAUDE.md zu duplizieren (sonst driftet sie).
   */
  catalog: Record<SubscriptionPlan, PlanLimits>;
  usage: { patients: number; caregivers: number; vehicles: number };
  /** Nur gesetzt, solange der Tenant zahlungssäumig ist (Regel 8). */
  grace: { since: string; deadline: string; daysRemaining: number } | null;
  /** true, sobald ein Stripe-Customer existiert -> Self-Service-Portal nutzbar. */
  portalAvailable: boolean;
}

/** Aktueller Abo-Status, Limits, Verbrauch und Karenzzeit des Tenants. */
export async function getSubscription(ctx: TenantContext): Promise<SubscriptionView> {
  return withTenant(ctx.organizationId, async (tx) => {
    const org = await tx.organization.findFirst({
      where: { id: ctx.organizationId },
      select: {
        subscriptionPlan: true,
        subscriptionStatus: true,
        planLimits: true,
        pastDueSince: true,
        stripeCustomerId: true,
      },
    });
    if (!org) throw new AppError(404, "Organisation nicht gefunden", "NotFound");

    // Verbrauch über dieselben Zähler wie die Durchsetzung (limits.ts), damit
    // die Anzeige nicht von der 402-Grenze abweicht.
    const [patients, caregivers, vehicles] = await Promise.all([
      tx.patient.count({ where: { organizationId: ctx.organizationId, isActive: true } }),
      tx.caregiver.count({ where: { organizationId: ctx.organizationId, isActive: true } }),
      tx.vehicle.count({ where: { organizationId: ctx.organizationId, isActive: true } }),
    ]);

    return {
      plan: org.subscriptionPlan,
      status: org.subscriptionStatus,
      limits: resolvePlanLimits(org.subscriptionPlan, org.planLimits),
      catalog: PLAN_LIMITS,
      usage: { patients, caregivers, vehicles },
      grace: org.pastDueSince
        ? {
            since: org.pastDueSince.toISOString(),
            deadline: graceDeadline(org.pastDueSince).toISOString(),
            daysRemaining: graceDaysRemaining(org.pastDueSince),
          }
        : null,
      portalAvailable: org.stripeCustomerId !== null,
    };
  });
}

export interface InvoiceView {
  id: string;
  number: string | null;
  amountDue: number;
  amountPaid: number;
  currency: string;
  status: InvoiceStatus;
  hostedInvoiceUrl: string | null;
  invoicePdfUrl: string | null;
  issuedAt: string;
}

/** Rechnungs-Historie des Tenants, neueste zuerst. */
export async function listInvoices(
  ctx: TenantContext,
  input: ListInvoicesInput,
): Promise<{ data: InvoiceView[]; total: number }> {
  return withTenant(ctx.organizationId, async (tx) => {
    const where = { organizationId: ctx.organizationId };
    const [rows, total] = await Promise.all([
      tx.invoice.findMany({ where, orderBy: { issuedAt: "desc" }, take: input.limit }),
      tx.invoice.count({ where }),
    ]);

    return {
      data: rows.map((r) => ({
        id: r.id,
        number: r.number,
        amountDue: r.amountDue,
        amountPaid: r.amountPaid,
        currency: r.currency,
        status: r.status,
        hostedInvoiceUrl: r.hostedInvoiceUrl,
        invoicePdfUrl: r.invoicePdfUrl,
        issuedAt: r.issuedAt.toISOString(),
      })),
      total,
    };
  });
}

/**
 * Öffnet das Stripe Billing-Portal (Self-Service). Setzt einen bestehenden
 * Stripe-Customer voraus (wird beim ersten Checkout angelegt).
 */
export async function createPortal(
  ctx: TenantContext,
  input: PortalInput,
): Promise<{ url: string }> {
  const org = await withTenant(ctx.organizationId, (tx) =>
    tx.organization.findFirst({
      where: { id: ctx.organizationId },
      select: { stripeCustomerId: true },
    }),
  );
  if (!org?.stripeCustomerId) {
    throw new AppError(
      409,
      "Kein aktives Abonnement – bitte zuerst einen Checkout abschließen",
      "Conflict",
    );
  }

  return getBillingProvider().createPortalSession({
    customerId: org.stripeCustomerId,
    returnUrl: billingUrl(input.locale),
  });
}

// ── Webhook-Verarbeitung ──────────────────────────────────────────────────

/**
 * Reserviert das Event. Der Insert auf dem Primärschlüssel ist das Gate: greift
 * er, sind wir der erste Verarbeiter; kollidiert er (P2002), war das Event
 * bereits da (Stripe liefert at-least-once) und wird verworfen.
 * Events ohne ID (Stub-Provider in Dev/Test) laufen ungefiltert durch.
 */
async function claimEvent(event: BillingEvent): Promise<boolean> {
  if (!event.id) return true;
  try {
    await prisma.billingWebhookEvent.create({ data: { id: event.id, type: event.type } });
    return true;
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return false;
    }
    throw err;
  }
}

/**
 * Gibt eine Reservierung wieder frei, wenn die Verarbeitung scheiterte – sonst
 * würde die Marke bestehen bleiben und Stripes Wiederholung als vermeintliches
 * Duplikat verworfen, das Event wäre still verloren.
 */
async function releaseEvent(event: BillingEvent): Promise<void> {
  if (!event.id) return;
  try {
    await prisma.billingWebhookEvent.delete({ where: { id: event.id } });
  } catch {
    // Freigabe ist best-effort: der ursprüngliche Fehler ist der wichtigere und
    // wird vom Aufrufer weitergereicht (-> 500 -> Stripe wiederholt).
  }
}

function str(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function int(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? Math.trunc(value) : null;
}

/**
 * Schreibt den Abo-Status auf den Tenant hinter der Stripe-Customer-ID und
 * pflegt dabei das Karenzzeit-Fenster (Regel 8):
 *  - PAST_DUE -> `pastDueSince` NUR setzen, wenn noch leer. Stripe wiederholt
 *    fehlgeschlagene Zahlungen (Smart Retries) und schickt je Versuch ein
 *    weiteres payment_failed; ohne diese Bedingung würde jeder Retry die
 *    Karenzzeit neu starten und der Tenant nie suspendiert werden.
 *  - sonst -> Fenster schließen (wieder bezahlt bzw. Endzustand erreicht).
 */
async function applyStatusByCustomer(
  customerId: string,
  status: SubscriptionStatus,
): Promise<void> {
  if (status === SubscriptionStatus.PAST_DUE) {
    await prisma.organization.updateMany({
      where: { stripeCustomerId: customerId, pastDueSince: null },
      data: { pastDueSince: new Date() },
    });
    await prisma.organization.updateMany({
      where: { stripeCustomerId: customerId },
      data: { subscriptionStatus: SubscriptionStatus.PAST_DUE },
    });
    return;
  }

  await prisma.organization.updateMany({
    where: { stripeCustomerId: customerId },
    data: { subscriptionStatus: status, pastDueSince: null },
  });
}

/** Spiegelt eine Stripe-Rechnung in die lokale Historie (Anzeige unter /billing). */
async function recordInvoice(event: BillingEvent, object: Record<string, unknown>): Promise<void> {
  const status = mapInvoiceStatus(event.type, str(object.status) ?? undefined);
  if (!status) return;

  const stripeInvoiceId = str(object.id);
  const customerId = str(object.customer);
  if (!stripeInvoiceId || !customerId) return;

  const org = await prisma.organization.findFirst({
    where: { stripeCustomerId: customerId },
    select: { id: true },
  });
  if (!org) return;

  const created = int(object.created);
  const data = {
    number: str(object.number),
    amountDue: int(object.amount_due) ?? 0,
    amountPaid: int(object.amount_paid) ?? 0,
    currency: str(object.currency) ?? "eur",
    status,
    hostedInvoiceUrl: str(object.hosted_invoice_url),
    invoicePdfUrl: str(object.invoice_pdf),
    // Stripe liefert Unix-Sekunden.
    issuedAt: created !== null ? new Date(created * 1000) : new Date(),
  };

  await prisma.invoice.upsert({
    where: { stripeInvoiceId },
    create: { organizationId: org.id, stripeInvoiceId, ...data },
    update: data,
  });
}

/**
 * Verarbeitet ein verifiziertes Stripe-Event (System-Pfad, kein Tenant-Kontext).
 * Idempotent über `billing_webhook_events`: doppelte Zustellungen werden
 * verworfen, scheitert die Verarbeitung wird die Reservierung zurückgegeben,
 * damit Stripes Wiederholung erneut greift. Unbekannte Events werden ignoriert.
 */
export async function handleStripeEvent(event: BillingEvent): Promise<void> {
  if (!(await claimEvent(event))) return;
  try {
    await processEvent(event);
  } catch (err) {
    await releaseEvent(event);
    throw err;
  }
}

async function processEvent(event: BillingEvent): Promise<void> {
  const object = event.data.object;

  // Checkout abgeschlossen: Plan + Stripe-IDs am Tenant setzen.
  if (event.type === "checkout.session.completed") {
    const metadata = (object.metadata ?? {}) as Record<string, unknown>;
    const organizationId = str(metadata.organizationId);
    if (!organizationId) return;

    const plan = parsePlan(metadata.plan);
    const customer = str(object.customer);
    const subscription = str(object.subscription);

    await prisma.organization.update({
      where: { id: organizationId },
      data: {
        subscriptionStatus: SubscriptionStatus.ACTIVE,
        // Frischer Checkout -> eine etwaige alte Karenzzeit ist gegenstandslos.
        pastDueSince: null,
        ...(plan
          ? {
              subscriptionPlan: plan,
              planLimits: PLAN_LIMITS[plan] as unknown as Prisma.InputJsonValue,
            }
          : {}),
        ...(customer ? { stripeCustomerId: customer } : {}),
        ...(subscription ? { stripeSubscriptionId: subscription } : {}),
      },
    });
    return;
  }

  // Subscription-Lebenszyklus: REALER Stripe-Status -> ermöglicht SUSPENDED bei
  // `unpaid` (Regel 8). Tenant über die Stripe-Customer-ID gefunden.
  if (
    event.type === "customer.subscription.updated" ||
    event.type === "customer.subscription.created"
  ) {
    const raw = str(object.status);
    const subStatus = raw ? mapSubscriptionStatus(raw) : null;
    const customerId = str(object.customer);
    if (!subStatus || !customerId) return;

    await applyStatusByCustomer(customerId, subStatus);

    const subscriptionId = str(object.id);
    if (subscriptionId) {
      await prisma.organization.updateMany({
        where: { stripeCustomerId: customerId },
        data: { stripeSubscriptionId: subscriptionId },
      });
    }
    return;
  }

  // Rechnungs-Events zusätzlich in der Historie spiegeln.
  await recordInvoice(event, object);

  // Übrige Events (Rechnungen, Kündigung) über Event-Typ -> Status.
  const status = mapEventToStatus(event.type);
  if (!status) return;
  const customerId = str(object.customer);
  if (!customerId) return;
  await applyStatusByCustomer(customerId, status);
}
