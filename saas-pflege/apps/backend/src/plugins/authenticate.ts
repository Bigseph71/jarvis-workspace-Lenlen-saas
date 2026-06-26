import type { FastifyReply, FastifyRequest } from "fastify";
import { verifyAccessToken } from "../lib/tokens.js";
import { UnauthorizedError } from "../lib/errors.js";

/**
 * preHandler: prüft den Bearer-Access-Token und hängt `request.user` an.
 * Der organizationId aus dem Token trägt den Tenant durch den Request.
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
  };
}
