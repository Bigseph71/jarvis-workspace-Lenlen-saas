import type { FastifyReply, FastifyRequest } from "fastify";
import { UserRole } from "@len-len/database";
import { ForbiddenError, UnauthorizedError } from "../lib/errors.js";
import { verifyAccessToken } from "../lib/tokens.js";
import { isAccessTokenRevoked } from "../lib/token-revocation.js";

/**
 * Zugang zum Super-Admin-Panel (/admin/*).
 *
 * Eigenständig, NICHT auf requireRole aufgesetzt. Der Unterschied ist kein
 * Stilfrage: die übrigen Wächter arbeiten innerhalb eines Tenants und setzen
 * voraus, dass `request.user.organizationId` den Zugriff ohnehin begrenzt –
 * die RLS fängt dort, was eine Rollenprüfung durchliesse. Unter /admin gibt es
 * diese zweite Schicht nicht: die Abfragen laufen über den Systempfad, ohne
 * Tenant-Filter, absichtlich über alle Organisationen hinweg. Ein Fehler hier
 * hat nichts hinter sich.
 *
 * Deshalb prüft dieser Wächter selbst und vollständig, statt sich auf einen
 * Hook zu verlassen, der anderswo registriert wird und dessen Reihenfolge sich
 * unbemerkt ändern kann: Signatur, Sperrliste, erzwungener Passwortwechsel,
 * Rolle. Er kann als einziger preHandler einer Route stehen.
 */
export async function requireSuperAdmin(
  request: FastifyRequest,
  _reply: FastifyReply,
): Promise<void> {
  const header = request.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    throw new UnauthorizedError("Authorization-Header fehlt");
  }

  const claims = verifyAccessToken(header.slice("Bearer ".length));

  if (await isAccessTokenRevoked(claims.sub, claims.iat)) {
    throw new UnauthorizedError("Sitzung wurde beendet");
  }

  // Ein Konto mit erzwungenem Passwortwechsel ist bis zum Wechsel funktionslos –
  // erst recht hier.
  if (claims.chpw === true) {
    throw new ForbiddenError("Passwortwechsel erforderlich");
  }

  if (claims.role !== UserRole.SUPER_ADMIN) {
    // Kein Hinweis darauf, dass es /admin überhaupt gibt: 403 statt einer
    // Erklärung, welche Rolle fehlt.
    throw new ForbiddenError("Kein Zugriff");
  }

  request.user = {
    userId: claims.sub,
    organizationId: claims.org,
    role: claims.role,
    mustChangePassword: false,
  };
}
