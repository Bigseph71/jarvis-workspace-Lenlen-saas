import { prisma, withTenant, type Prisma, type SubscriptionPlan } from "@len-len/database";
import { env } from "../../config/env.js";
import { AppError } from "../../lib/errors.js";
import type { TenantContext } from "../../lib/context.js";
import { getBillingProvider, type BillingEvent } from "../../lib/billing/index.js";
import { PLAN_LIMITS, parsePlan } from "./plan.js";
import { mapEventToStatus } from "./events.js";

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

/** Liefert den aktuellen Abo-Status + Limits des Tenants. */
export async function getSubscription(ctx: TenantContext): Promise<unknown> {
  return withTenant(ctx.organizationId, async (tx) => {
    const org = await tx.organization.findFirst({
      where: { id: ctx.organizationId },
      select: { subscriptionPlan: true, subscriptionStatus: true },
    });
    if (!org) throw new AppError(404, "Organisation nicht gefunden", "NotFound");
    return {
      plan: org.subscriptionPlan,
      status: org.subscriptionStatus,
      limits: PLAN_LIMITS[org.subscriptionPlan],
    };
  });
}

/**
 * Verarbeitet ein verifiziertes Stripe-Event (System-Pfad, kein Tenant-Kontext).
 * Idempotent genug für MVP; unbekannte Events werden ignoriert.
 */
export async function handleStripeEvent(event: BillingEvent): Promise<void> {
  const status = mapEventToStatus(event.type);
  if (!status) return;

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
        subscriptionStatus: status,
        ...(plan
          ? { subscriptionPlan: plan, planLimits: PLAN_LIMITS[plan] as unknown as Prisma.InputJsonValue }
          : {}),
        ...(typeof object.customer === "string" ? { stripeCustomerId: object.customer } : {}),
        ...(typeof object.subscription === "string" ? { stripeSubscriptionId: object.subscription } : {}),
      },
    });
    return;
  }

  // Übrige Events: Tenant über die Stripe-Customer-ID finden.
  const customerId = typeof object.customer === "string" ? object.customer : null;
  if (!customerId) return;
  await prisma.organization.updateMany({
    where: { stripeCustomerId: customerId },
    data: { subscriptionStatus: status },
  });
}
