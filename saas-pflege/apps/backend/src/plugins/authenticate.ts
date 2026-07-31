import type { FastifyReply, FastifyRequest } from "fastify";
import { verifyAccessToken } from "../lib/tokens.js";
import { AppError, UnauthorizedError } from "../lib/errors.js";

/**
 * Routen, die trotz erzwungenem Passwortwechsel erreichbar bleiben müssen –
 * sonst könnte der Wechsel selbst nicht durchgeführt werden.
 */
const PASSWORD_CHANGE_EXEMPT = new Set(["/auth/change-password", "/auth/me"]);

/**
 * preHandler: prüft den Bearer-Access-Token und hängt `request.user` an.
 * Der organizationId aus dem Token trägt den Tenant durch den Request.
 *
 * Steht der Passwortwechsel aus (temporäres Passwort vom Admin), wird jeder
 * andere Endpoint mit 403 blockiert: das Konto ist angemeldet, aber bis zum
 * Wechsel funktionslos.
 */
export async function authenticate(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
  const header = request.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    throw new UnauthorizedError("Authorization-Header fehlt");
  }
  const claims = verifyAccessToken(header.slice("Bearer ".length));
  request.user = {
    userId: claims.sub,
    organizationId: claims.org,
    role: claims.role,
    mustChangePassword: claims.chpw === true,
  };

  if (claims.chpw === true && !PASSWORD_CHANGE_EXEMPT.has(request.routeOptions.url ?? "")) {
    throw new AppError(403, "Passwortwechsel erforderlich", "PasswordChangeRequired");
  }
}
