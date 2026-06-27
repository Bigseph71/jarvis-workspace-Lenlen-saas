import type { FastifyInstance, FastifyRequest } from "fastify";
import { UserRole } from "@len-len/database";
import { authenticate } from "../../plugins/authenticate.js";
import { requireRole } from "../../plugins/rbac.js";
import type { TenantContext } from "../../lib/context.js";
import { checkoutSchema } from "./billing.schemas.js";
import { createCheckout, getSubscription } from "./billing.service.js";

// Billing nur für die Admin-Ebene.
const canManageBilling = requireRole(UserRole.SUPER_ADMIN, UserRole.STRUKTUR_ADMIN);

function ctxFrom(req: FastifyRequest): TenantContext {
  return { organizationId: req.user!.organizationId, userId: req.user!.userId };
}

export async function billingRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", authenticate);

  app.get("/billing/subscription", { preHandler: [canManageBilling] }, async (request) => {
    return getSubscription(ctxFrom(request));
  });

  app.post("/billing/checkout", { preHandler: [canManageBilling] }, async (request) => {
    const { plan } = checkoutSchema.parse(request.body);
    return createCheckout(ctxFrom(request), plan);
  });
}
