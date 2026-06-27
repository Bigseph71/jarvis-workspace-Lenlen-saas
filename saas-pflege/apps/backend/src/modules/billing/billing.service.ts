import { prisma, withTenant, type Prisma, type SubscriptionPlan } from "@len-len/database";
import { env } from "../../config/env.js";
import { AppError } from "../../lib/errors.js";
import type { TenantContext } from "../../lib/context.js";
import { getBillingProvider, type BillingEvent } from "../../lib/billing/index.js";
import { PLAN_LIMITS, parsePlan, resolvePlanLimits } from "./plan.js";
import { mapEventToStatus, mapSubscriptionStatus } from "./events.js";

/** Startet eine Stripe-Checkout-Session für den aktuellen Tenant. */
export async function createCheckout(
  ctx: TenantContext,
  plan: SubscriptionPlan,
): Promise<{ url: string }> {
  const base = env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000";
  const session = await getBillingProvider().createCheckoutSession({
    organizationId: ctx.organizationId,
    plan,
    successUrl: `${base}/billing/success`,
    cancelUrl: `${base}/billing/cancel`,
  });
  return { url: session.url };
}

/** Liefert den aktuellen Abo-Status + (überschriebene) Limits des Tenants. */
export async function getSubscription(ctx: TenantContext): Promise<unknown> {
  return withTenant(ctx.organizationId, async (tx) => {
    const org = await tx.organization.findFirst({
      where: { id: ctx.organizationId },
      select: { subscriptionPlan: true, subscriptionStatus: true, planLimits: true },
    });
    if (!org) throw new AppError(404, "Organisation nicht gefunden", "NotFound");
    return {
      plan: org.subscriptionPlan,
      status: org.subscriptionStatus,
      limits: resolvePlanLimits(org.subscriptionPlan, org.planLimits),
    };
  });
}

/**
 * Öffnet das Stripe Billing-Portal (Self-Service). Setzt einen bestehenden
 * Stripe-Customer voraus (wird beim ersten Checkout angelegt).
 */
export async function createPortal(ctx: TenantContext): Promise<{ url: string }> {
  const org = await withTenant(ctx.organizationId, (tx) =>
    tx.organization.findFirst({
      where: { id: ctx.organizationId },
      select: { stripeCustomerId: true },
    }),
  );
  if (!org?.stripeCustomerId) {
    throw new AppError(409, "Kein aktives Abonnement – bitte zuerst einen Checkout abschließen", "Conflict");
  }

  const base = env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000";
  return getBillingProvider().createPortalSession({
    customerId: org.stripeCustomerId,
    returnUrl: `${base}/billing`,
  });
}

/**
 * Verarbeitet ein verifiziertes Stripe-Event (System-Pfad, kein Tenant-Kontext).
 * Idempotent genug für MVP; unbekannte Events werden ignoriert.
 */
export async function handleStripeEvent(event: BillingEvent): Promise<void> {
  const object = event.data.object;

  // Checkout abgeschlossen: Plan + Stripe-IDs am Tenant setzen.
  if (event.type === "checkout.session.completed") {
    const metadata = (object.metadata ?? {}) as Record<string, unknown>;
    const organizationId = typeof metadata.organizationId === "string" ? metadata.organizationId : null;
    if (!organizationId) return;

    const plan = parsePlan(metadata.plan);
    await prisma.organization.update({
      where: { id: organizationId },
      data: {
        subscriptionStatus: "ACTIVE",
        ...(plan
          ? { subscriptionPlan: plan, planLimits: PLAN_LIMITS[plan] as unknown as Prisma.InputJsonValue }
          : {}),
        ...(typeof object.customer === "string" ? { stripeCustomerId: object.customer } : {}),
        ...(typeof object.subscription === "string" ? { stripeSubscriptionId: object.subscription } : {}),
      },
    });
    return;
  }

  // Subscription-Lebenszyklus: REALER Stripe-Status -> ermöglicht SUSPENDED bei
  // `unpaid` (Regel 8). Tenant über die Stripe-Customer-ID gefunden.
  if (event.type === "customer.subscription.updated" || event.type === "customer.subscription.created") {
    const subStatus = typeof object.status === "string" ? mapSubscriptionStatus(object.status) : null;
    const customerId = typeof object.customer === "string" ? object.customer : null;
    if (!subStatus || !customerId) return;
    await prisma.organization.updateMany({
      where: { stripeCustomerId: customerId },
      data: {
        subscriptionStatus: subStatus,
        ...(typeof object.id === "string" ? { stripeSubscriptionId: object.id } : {}),
      },
    });
    return;
  }

  // Übrige Events (Rechnungen, Kündigung) über Event-Typ -> Status.
  const status = mapEventToStatus(event.type);
  if (!status) return;
  const customerId = typeof object.customer === "string" ? object.customer : null;
  if (!customerId) return;
  await prisma.organization.updateMany({
    where: { stripeCustomerId: customerId },
    data: { subscriptionStatus: status },
  });
}
