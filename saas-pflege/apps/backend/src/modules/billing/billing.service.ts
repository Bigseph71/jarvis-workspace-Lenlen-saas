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
import { planForPrice } from "../../lib/billing/prices.js";
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

/**
 * Ergebnis einer Plan-Auswahl. Zwei Wege, weil ein Tenant mit laufendem Abo
 * NICHT durch den Checkout darf (siehe createCheckout):
 *  - `checkout`   -> Weiterleitung zu Stripe (Erstabschluss oder Neuabschluss)
 *  - `planChanged` -> am bestehenden Abo gewechselt, keine Weiterleitung nötig
 */
export type CheckoutResult =
  | { kind: "checkout"; url: string }
  | { kind: "planChanged"; plan: SubscriptionPlan };

/**
 * Verhindert den Wechsel in einen Plan, dessen Limits der Tenant heute schon
 * überschreitet. Ohne die Prüfung bliebe der Bestand zwar erhalten, aber jedes
 * weitere Anlegen scheiterte an 402 (limits.ts) – der Tenant hätte bezahlt und
 * käme trotzdem nicht weiter.
 *
 * Geprüft wird gegen die KATALOG-Limits des Zielplans: ein ausgehandelter
 * Override in `planLimits` gehört zum bisherigen Vertrag und gilt für den neuen
 * Plan nicht automatisch weiter.
 */
async function assertPlanFitsUsage(
  organizationId: string,
  plan: SubscriptionPlan,
): Promise<void> {
  const limits = PLAN_LIMITS[plan];

  const usage = await withTenant(organizationId, async (tx) => {
    const [patients, caregivers, vehicles] = await Promise.all([
      tx.patient.count({ where: { organizationId, isActive: true } }),
      tx.caregiver.count({ where: { organizationId, isActive: true } }),
      tx.vehicle.count({ where: { organizationId, isActive: true } }),
    ]);
    return { patients, caregivers, vehicles };
  });

  const over: string[] = [];
  if (usage.patients > limits.patients) {
    over.push(`Patienten (${usage.patients} > ${limits.patients})`);
  }
  if (usage.caregivers > limits.caregivers) {
    over.push(`Fachkräfte (${usage.caregivers} > ${limits.caregivers})`);
  }
  // null = unbegrenzt (Enterprise-Fahrzeuge), dann gibt es nichts zu prüfen.
  if (limits.vehicles !== null && usage.vehicles > limits.vehicles) {
    over.push(`Fahrzeuge (${usage.vehicles} > ${limits.vehicles})`);
  }

  if (over.length > 0) {
    throw new AppError(
      409,
      `Der Bestand überschreitet die Limits von ${plan}: ${over.join(", ")}`,
      "PlanTooSmall",
    );
  }
}

/**
 * Wählt einen Plan: Checkout beim Erstabschluss, Wechsel am bestehenden Abo,
 * sobald der Tenant bereits eines hat.
 *
 * Der Unterschied ist nicht kosmetisch. Stripe erlaubt beliebig viele Abos je
 * Customer: ein zweiter Checkout ließe das alte Abo weiterlaufen, der Tenant
 * würde doppelt belastet, und `stripeSubscriptionId` zeigte nur noch auf das
 * neueste – das alte wäre für Kündigung und Statusverfolgung verloren.
 */
export async function createCheckout(
  ctx: TenantContext,
  input: CheckoutInput,
): Promise<CheckoutResult> {
  // Bestehenden Customer und die E-Mail des Handelnden mitgeben: das eine
  // verhindert doppelte Kunden bei Stripe, das andere erspart dem Admin, seine
  // Adresse im Checkout erneut einzutippen.
  const { org, email } = await withTenant(ctx.organizationId, async (tx) => {
    const [organization, user] = await Promise.all([
      tx.organization.findFirst({
        where: { id: ctx.organizationId },
        // Plan und Status bewusst NICHT: die Entscheidung checkout-vs-Wechsel
        // fällt weiter unten anhand des Zustands bei Stripe, nicht anhand
        // unseres Spiegels.
        select: { stripeCustomerId: true, stripeSubscriptionId: true },
      }),
      ctx.userId
        ? tx.user.findFirst({ where: { id: ctx.userId }, select: { email: true } })
        : Promise.resolve(null),
    ]);
    return { org: organization, email: user?.email };
  });
  if (!org) throw new AppError(404, "Organisation nicht gefunden", "NotFound");

  await assertPlanFitsUsage(ctx.organizationId, input.plan);

  // Ob ein zweites Abo entstünde, weiß nur Stripe. Der lokal gespeicherte Status
  // taugt dafür nicht: SUSPENDED steht sowohl für `unpaid` (das Abo besteht,
  // ein Checkout belastete doppelt) als auch für `incomplete_expired` (das Abo
  // ist tot, nur ein Checkout hilft weiter). Auch ACTIVE ist keine Garantie –
  // ein verpasster Webhook lässt den lokalen Status veralten.
  // Deshalb hier die Rückfrage an der Quelle, statt sich auf eine
  // Dashboard-Einstellung oder den eigenen Spiegel zu verlassen.
  const subscriptionId = org.stripeSubscriptionId;
  const state = subscriptionId
    ? await getBillingProvider().getSubscriptionState(subscriptionId)
    : null;

  if (subscriptionId && state?.live) {
    // Sonderpreis oder mehrere Positionen: der Plan hinter dem Abo ist nicht
    // eindeutig. Ihn auf den Katalogpreis umzustellen würde eine ausgehandelte
    // Kondition stillschweigend löschen – hier hört die Automatik auf.
    if (state.plan === null) {
      throw new AppError(
        409,
        `Dieses Abonnement läuft auf einer Sonderkondition (Stripe-Status: ${state.status}) ` +
          "und kann nicht automatisch gewechselt werden. Bitte wenden Sie sich an den Support.",
        "PlanChangeUnsupported",
      );
    }

    // Gegen den Plan bei STRIPE prüfen, nicht gegen den lokalen: nur so ist die
    // Meldung auch dann richtig, wenn der Spiegel gerade hinterherhinkt.
    if (state.plan === input.plan) {
      throw new AppError(409, `Plan ${input.plan} ist bereits aktiv`, "Conflict");
    }

    await getBillingProvider().changeSubscriptionPlan({
      organizationId: ctx.organizationId,
      subscriptionId,
      plan: input.plan,
    });

    // Sofort spiegeln, damit die Oberfläche nicht auf den Webhook warten muss.
    // `customer.subscription.updated` schreibt gleich darauf denselben Plan
    // noch einmal (aus dem Preis abgeleitet) – das ist idempotent.
    await prisma.organization.updateMany({
      where: { id: ctx.organizationId },
      data: {
        subscriptionPlan: input.plan,
        planLimits: PLAN_LIMITS[input.plan] as unknown as Prisma.InputJsonValue,
      },
    });

    return { kind: "planChanged", plan: input.plan };
  }

  const session = await getBillingProvider().createCheckoutSession({
    organizationId: ctx.organizationId,
    plan: input.plan,
    successUrl: billingUrl(input.locale, "?checkout=success"),
    cancelUrl: billingUrl(input.locale, "?checkout=cancel"),
    customerId: org.stripeCustomerId ?? undefined,
    customerEmail: email,
  });
  return { kind: "checkout", url: session.url };
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
 * Plan eines Abo-Objekts, abgeleitet aus dem Preis seiner einzigen Position.
 * Bewusst nicht aus `metadata.plan`: ein Wechsel über das Stripe-Kundenportal
 * ändert den Preis, nicht die Metadaten (siehe prices.ts).
 * null = kein eindeutiger Plan (mehrere Positionen oder unbekannter Preis).
 */
function planFromSubscription(object: Record<string, unknown>): SubscriptionPlan | null {
  const items = (object.items as { data?: unknown } | undefined)?.data;
  if (!Array.isArray(items) || items.length !== 1) return null;

  const price = (items[0] as { price?: { id?: unknown } } | undefined)?.price;
  const priceId = str(price?.id);
  if (!priceId) return null;

  return parsePlan(planForPrice(priceId));
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

    // updateMany statt update: ein gelöschter Tenant darf das Event nicht
    // werfen lassen, sonst wiederholte Stripe es tagelang gegen eine Zeile,
    // die es nicht mehr gibt.
    await prisma.organization.updateMany({
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

    // Beim allerersten Abo kann dieses Event VOR checkout.session.completed
    // eintreffen; die Customer-ID steht dann noch an keinem Tenant und das
    // Event fiele ins Leere. Die Metadaten des Abos (im Checkout gesetzt)
    // stellen die Zuordnung her.
    const linked = await prisma.organization.count({ where: { stripeCustomerId: customerId } });
    if (linked === 0) {
      const metadata = (object.metadata ?? {}) as Record<string, unknown>;
      const organizationId = str(metadata.organizationId);
      if (organizationId) {
        await prisma.organization.updateMany({
          where: { id: organizationId },
          data: { stripeCustomerId: customerId },
        });
      }
    }

    await applyStatusByCustomer(customerId, subStatus);

    // Plan nachziehen, falls er sich geändert hat. Deckt auch den Wechsel ab,
    // den ein Kunde selbst im Stripe-Kundenportal auslöst – dort läuft nichts
    // über unsere API.
    //
    // Die Bedingung `subscriptionPlan: { not: plan }` ist nicht bloß Sparsamkeit:
    // `customer.subscription.updated` trifft auch bei Zahlungsmittel-Wechsel oder
    // Verlängerung ein. Ohne sie würde jedes dieser Events `planLimits` auf die
    // Katalogwerte zurücksetzen und einen ausgehandelten Override still löschen.
    const plan = planFromSubscription(object);
    if (plan) {
      await prisma.organization.updateMany({
        where: { stripeCustomerId: customerId, subscriptionPlan: { not: plan } },
        data: {
          subscriptionPlan: plan,
          planLimits: PLAN_LIMITS[plan] as unknown as Prisma.InputJsonValue,
        },
      });
    }

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
