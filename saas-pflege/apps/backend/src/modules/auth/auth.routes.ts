import type { FastifyInstance } from "fastify";
import { UserRole } from "@len-len/database";
import { authenticate } from "../../plugins/authenticate.js";
import { requireRole } from "../../plugins/rbac.js";
import {
  registerOrganizationSchema,
  loginSchema,
  refreshSchema,
  logoutSchema,
} from "./auth.schemas.js";
import {
  registerOrganization,
  login,
  rotateRefreshToken,
  logout,
  getProfile,
} from "./auth.service.js";

// Strengeres Limit für Auth-Endpoints (Brute-Force-Schutz).
const strictLimit = { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } };

export async function authRoutes(app: FastifyInstance): Promise<void> {
  // Bootstrap: neue Organisation + erster Struktur-Admin (öffentlich).
  app.post("/auth/register-organization", strictLimit, async (request, reply) => {
    const input = registerOrganizationSchema.parse(request.body);
    const result = await registerOrganization(input);
    return reply.status(201).send(result);
  });

  // Login.
  app.post("/auth/login", strictLimit, async (request, reply) => {
    const input = loginSchema.parse(request.body);
    const result = await login(input);
    return reply.send(result);
  });

  // Refresh-Rotation.
  app.post("/auth/refresh", strictLimit, async (request, reply) => {
    const { refreshToken } = refreshSchema.parse(request.body);
    const result = await rotateRefreshToken(refreshToken);
    return reply.send(result);
  });

  // Logout (widerruft das Refresh-Token).
  app.post("/auth/logout", async (request, reply) => {
    const { refreshToken } = logoutSchema.parse(request.body);
    await logout(refreshToken);
    return reply.status(204).send();
  });

  // Eigenes Profil (geschützt, Tenant-gescoped).
  app.get("/auth/me", { preHandler: [authenticate] }, async (request) => {
    const { userId, organizationId } = request.user!;
    return getProfile(userId, organizationId);
  });

  // Beispiel einer rollengeschützten Route (nur Admin-Ebene).
  app.get(
    "/auth/admin/ping",
    { preHandler: [authenticate, requireRole(UserRole.SUPER_ADMIN, UserRole.STRUKTUR_ADMIN)] },
    async (request) => ({ ok: true, role: request.user!.role }),
  );
}
