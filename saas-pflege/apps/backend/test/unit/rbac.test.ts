import { describe, it, expect } from "vitest";
import type { FastifyReply, FastifyRequest } from "fastify";
import { requireRole } from "../../src/plugins/rbac.js";
import { ForbiddenError, UnauthorizedError } from "../../src/lib/errors.js";

const reply = {} as FastifyReply;

function reqWithRole(role?: string): FastifyRequest {
  return { user: role ? { userId: "u", organizationId: "o", role } : undefined } as unknown as FastifyRequest;
}

describe("requireRole", () => {
  it("lässt erlaubte Rollen durch", async () => {
    const guard = requireRole("STRUKTUR_ADMIN" as never, "KOORDINATOR" as never);
    await expect(guard(reqWithRole("KOORDINATOR"), reply)).resolves.toBeUndefined();
  });

  it("blockt nicht erlaubte Rollen mit ForbiddenError", async () => {
    const guard = requireRole("STRUKTUR_ADMIN" as never);
    await expect(guard(reqWithRole("FACHKRAFT"), reply)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("verlangt einen authentifizierten User", async () => {
    const guard = requireRole("FACHKRAFT" as never);
    await expect(guard(reqWithRole(undefined), reply)).rejects.toBeInstanceOf(UnauthorizedError);
  });
});
