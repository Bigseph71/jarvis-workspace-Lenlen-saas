import type { FastifyInstance } from "fastify";
import { UserRole } from "@len-len/database";
import { authenticate } from "../../plugins/authenticate.js";
import { requireRole } from "../../plugins/rbac.js";
import type { TenantContext } from "../../lib/context.js";
import { createFachkraftUserSchema, userIdParamSchema } from "./user.schemas.js";
import { createFachkraftUser, reissueInvitation } from "./user.service.js";

// Kontenverwaltung ist Admin-/HR-Sache – identisch zum Schreibrecht auf
// Fachkräfte, damit der Anlage-Flow (Fachkraft + Konto) in einer Rolle bleibt.
const canManageAccounts = requireRole(
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

  // Konto für eine bestehende Fachkraft anlegen. Kein Passwort: die Antwort
  // enthält einen Einladungslink, über den die Fachkraft ihres selbst setzt.
  app.post(
    "/users/fachkraft",
    { ...strictLimit, preHandler: [canManageAccounts] },
    async (request, reply) => {
      const input = createFachkraftUserSchema.parse(request.body);
      const account = await createFachkraftUser(ctxFrom(request), input);
      return reply.status(201).send(account);
    },
  );

  // Neuer Einladungslink für ein bestehendes Fachkraft-Konto. Trat an die
  // Stelle von /reset-password: dort gab der Server ein Passwort im Klartext
  // zurück, das der Admin damit kannte.
  app.post(
    "/users/:id/invitation",
    { ...strictLimit, preHandler: [canManageAccounts] },
    async (request) => {
      const { id } = userIdParamSchema.parse(request.params);
      return reissueInvitation(ctxFrom(request), id);
    },
  );
}
