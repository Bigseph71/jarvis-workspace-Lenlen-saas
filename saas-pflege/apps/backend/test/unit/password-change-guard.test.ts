import { describe, expect, it } from "vitest";
import type { FastifyReply, FastifyRequest } from "fastify";
import { authenticate } from "../../src/plugins/authenticate.js";
import { signAccessToken, verifyAccessToken } from "../../src/lib/tokens.js";
import { AppError } from "../../src/lib/errors.js";

const reply = {} as FastifyReply;

function tokenFor(mustChange: boolean): string {
  return signAccessToken({
    sub: "user-1",
    org: "org-1",
    role: "FACHKRAFT" as never,
    chpw: mustChange,
  });
}

function requestFor(mustChange: boolean, url: string): FastifyRequest {
  return {
    headers: { authorization: `Bearer ${tokenFor(mustChange)}` },
    routeOptions: { url },
  } as unknown as FastifyRequest;
}

describe("chpw-Claim", () => {
  it("überlebt den Sign-/Verify-Round-Trip", () => {
    expect(verifyAccessToken(tokenFor(true)).chpw).toBe(true);
    expect(verifyAccessToken(tokenFor(false)).chpw).toBe(false);
  });
});

describe("authenticate: erzwungener Passwortwechsel", () => {
  it("blockt fachliche Endpoints mit 403 PasswordChangeRequired", async () => {
    const request = requestFor(true, "/visits/my-day");
    await expect(authenticate(request, reply)).rejects.toMatchObject({
      statusCode: 403,
      code: "PasswordChangeRequired",
    });
  });

  it("lässt den Passwortwechsel selbst und /auth/me durch", async () => {
    await expect(
      authenticate(requestFor(true, "/auth/change-password"), reply),
    ).resolves.toBeUndefined();
    await expect(authenticate(requestFor(true, "/auth/me"), reply)).resolves.toBeUndefined();
  });

  it("markiert den Request-User, damit Handler den Zustand kennen", async () => {
    const request = requestFor(true, "/auth/me");
    await authenticate(request, reply);
    expect(request.user?.mustChangePassword).toBe(true);
  });

  it("lässt Konten ohne ausstehenden Wechsel überall durch", async () => {
    const request = requestFor(false, "/visits/my-day");
    await expect(authenticate(request, reply)).resolves.toBeUndefined();
    expect(request.user?.mustChangePassword).toBe(false);
  });

  it("wirft weiterhin bei fehlendem Header", async () => {
    const request = { headers: {}, routeOptions: { url: "/visits/my-day" } } as FastifyRequest;
    await expect(authenticate(request, reply)).rejects.toBeInstanceOf(AppError);
  });
});
