import { SubscriptionStatus } from "@len-len/database";
import { AppError } from "../../lib/errors.js";
import type { TenantTx } from "../../lib/context.js";
import { limitFor, type LimitedResource } from "./plan.js";

async function countResource(
  tx: TenantTx,
  organizationId: string,
  resource: LimitedResource,
): Promise<number> {
  if (resource === "patients") {
    return tx.patient.count({ where: { organizationId, isActive: true } });
  }
  if (resource === "caregivers") {
    return tx.caregiver.count({ where: { organizationId, isActive: true } });
  }
  return tx.vehicle.count({ where: { organizationId, isActive: true } });
}

/**
 * Erzwingt das Plan-Limit serverseitig. Wirft HTTP 402 bei Überschreitung oder
 * inaktivem Abo (Regel 8). Innerhalb der anlegenden Transaktion aufrufen, damit
 * Zählung und Insert konsistent sind.
 */
export async function assertWithinPlan(
  tx: TenantTx,
  organizationId: string,
  resource: LimitedResource,
): Promise<void> {
  const org = await tx.organization.findFirst({
    where: { id: organizationId },
    select: { subscriptionPlan: true, subscriptionStatus: true },
  });
  if (!org) throw new AppError(404, "Organisation nicht gefunden", "NotFound");

  if (
    org.subscriptionStatus === SubscriptionStatus.SUSPENDED ||
    org.subscriptionStatus === SubscriptionStatus.CANCELED
  ) {
    throw new AppError(402, "Abonnement nicht aktiv", "PaymentRequired");
  }

  const limit = limitFor(org.subscriptionPlan, resource);
  if (limit === null) return; // unbegrenzt

  const count = await countResource(tx, organizationId, resource);
  if (count >= limit) {
    throw new AppError(402, `Plan-Limit erreicht (${resource}: max. ${limit})`, "PaymentRequired");
  }
}
