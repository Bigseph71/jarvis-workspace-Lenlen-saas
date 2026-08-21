import type { FastifyReply, FastifyRequest } from "fastify";
import type { UserRole } from "@len-len/database";
import { ForbiddenError, UnauthorizedError } from "../lib/errors.js";

/**
 * preHandler-Factory für rollenbasierte Autorisierung.
 * Muss NACH `authenticate` laufen.
 *
 *   { preHandler: [authenticate, requireRole("STRUKTUR_ADMIN", "KOORDINATOR")] }
 *
 * SUPER_ADMIN gehört in KEINEN dieser Wächter, mit Ausnahme von Abrechnung und
 * Fahrzeugen (Betrieb, kein Personenbezug). Er sieht keine Daten eines
 * Tenants – weder Patienten noch Fachkräfte, Verträge, Standorte oder
 * Nachrichten. Datenminimierung: wer die Plattform betreibt, braucht die
 * Pflegedaten nicht.
 *
 * Sein Bereich ist /admin, abgesichert durch requireSuperAdmin. Wer hier
 * SUPER_ADMIN ergänzt, hebelt diese Trennung aus – und die Zusicherung, die
 * einem Pflegedienst gegenüber gilt.
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
