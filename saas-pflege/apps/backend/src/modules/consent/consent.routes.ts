import type { FastifyInstance, FastifyRequest } from "fastify";
import { UserRole } from "@len-len/database";
import { authenticate } from "../../plugins/authenticate.js";
import { requireRole } from "../../plugins/rbac.js";
import type { TenantContext } from "../../lib/context.js";
import { grantGpsConsentSchema } from "./consent.schemas.js";
import { getGpsConsentStatus, grantGpsConsent, revokeGpsConsent } from "./consent.service.js";

// Nur die Fachkraft selbst. Eine Einwilligung, die ein Vorgesetzter für sie
// erteilen könnte, wäre keine: sie muss freiwillig und höchstpersönlich sein
// (DSGVO Art. 4 Nr. 11). Deshalb hat hier auch kein Admin Zugriff.
const canManageOwnConsent = requireRole(UserRole.FACHKRAFT);

function ctxFrom(req: FastifyRequest): TenantContext {
  return { organizationId: req.user!.organizationId, userId: req.user!.userId };
}

export async function consentRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", authenticate);

  app.get("/consent/gps", { preHandler: [canManageOwnConsent] }, async (request) => {
    return getGpsConsentStatus(ctxFrom(request));
  });

  app.post("/consent/gps", { preHandler: [canManageOwnConsent] }, async (request, reply) => {
    const input = grantGpsConsentSchema.parse(request.body ?? {});
    const status = await grantGpsConsent(ctxFrom(request), input);
    return reply.status(201).send(status);
  });

  // Widerruf muss so einfach sein wie die Erteilung (Art. 7 Abs. 3): eigener
  // Endpunkt, keine Zusatzbedingung, kein Grund anzugeben.
  app.delete("/consent/gps", { preHandler: [canManageOwnConsent] }, async (request) => {
    return revokeGpsConsent(ctxFrom(request));
  });
}
