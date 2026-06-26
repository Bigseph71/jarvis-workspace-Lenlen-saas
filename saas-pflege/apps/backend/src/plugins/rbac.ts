import type { FastifyReply, FastifyRequest } from "fastify";
import type { UserRole } from "@len-len/database";
import { ForbiddenError, UnauthorizedError } from "../lib/errors.js";

/**
 * preHandler-Factory für rollenbasierte Autorisierung.
 * Muss NACH `authenticate` laufen.
 *
 *   { preHandler: [authenticate, requireRole("STRUKTUR_ADMIN", "KOORDINATOR")] }
 */
export function requireRole(...allowed: UserRole[]) {
  return async function (request: FastifyRequest, _reply: FastifyReply): Promise<void> {
    if (!request.user) {
      throw new UnauthorizedError();
    }
    if (!allowed.includes(request.user.role)) {
      throw new ForbiddenError(
        `Rolle ${request.user.role} hat keinen Zugriff (erlaubt: ${allowed.join(", ")})`,
      );
    }
  };
}
