import type { UserRole } from "@len-len/database";

/** Vom `authenticate`-preHandler gesetzter Request-Kontext. */
export interface AuthenticatedUser {
  userId: string;
  organizationId: string;
  role: UserRole;
  /** Erzwungener Passwortwechsel steht noch aus (temporäres Passwort). */
  mustChangePassword: boolean;
}

declare module "fastify" {
  interface FastifyRequest {
    user?: AuthenticatedUser;
  }
}
