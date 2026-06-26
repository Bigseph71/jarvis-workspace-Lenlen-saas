import type { UserRole } from "@len-len/database";

/** Vom `authenticate`-preHandler gesetzter Request-Kontext. */
export interface AuthenticatedUser {
  userId: string;
  organizationId: string;
  role: UserRole;
}

declare module "fastify" {
  interface FastifyRequest {
    user?: AuthenticatedUser;
  }
}
