import type { FastifyInstance } from "fastify";
import { UserRole } from "@len-len/database";
import { authenticate } from "../../plugins/authenticate.js";
import { requireRole } from "../../plugins/rbac.js";
import type { TenantContext } from "../../lib/context.js";
import { createFachkraftUserSchema, userIdParamSchema } from "./user.schemas.js";
import { createFachkraftUser, resetFachkraftPassword } from "./user.service.js";

// Kontenverwaltung ist Admin-/HR-Sache – identisch zum Schreibrecht auf
// Fachkräfte, damit der Anlage-Flow (Fachkraft + Konto) in einer Rolle bleibt.
const canManageAccounts = requireRole(
  UserRole.SUPER_ADMIN,
  UserRole.STRUKTUR_ADMIN,
  UserRole.HR,
);

// Kontenerstellung erzeugt Zugangsdaten – strenger begrenzt als der Rest.
const strictLimit = { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } };

function ctxFrom(req: { user?: { userId: string; organizationId: string } }): TenantContext {
  return { organizationId: req.user!.organizationId, userId: req.user!.userId };
}

export async function userRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", authenticate);

  // Konto für eine bestehende Fachkraft anlegen (Passwort wird generiert).
  app.post(
    "/users/fachkraft",
    { ...strictLimit, preHandler: [canManageAccounts] },
    async (request, reply) => {
      const input = createFachkraftUserSchema.parse(request.body);
      const account = await createFachkraftUser(ctxFrom(request), input);
      return reply.status(201).send(account);
    },
  );

  // Neues temporäres Passwort für ein bestehendes Fachkraft-Konto.
  app.post(
    "/users/:id/reset-password",
    { ...strictLimit, preHandler: [canManageAccounts] },
    async (request) => {
      const { id } = userIdParamSchema.parse(request.params);
      return resetFachkraftPassword(ctxFrom(request), id);
    },
  );
}
