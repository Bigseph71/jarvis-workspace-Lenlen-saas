import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * Das Refresh-Token im httpOnly-Cookie.
 *
 * Geprüft wird hier, was der Browser am Ende wirklich zu sehen bekommt: die
 * Attribute des Cookies und die Frage, wann es gesetzt, behalten oder
 * gelöscht wird. Gerade der Unterschied zwischen "Sitzung ungültig" und
 * "Backend gestört" entscheidet, ob eine Störung von einer Minute die ganze
 * Plattform abmeldet – das ist keine Feinheit, sondern der Zweck der Sache.
 */

let cookieJar: Record<string, string> = {};

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      cookieJar[name] !== undefined ? { name, value: cookieJar[name] } : undefined,
  }),
}));

const fetchMock = vi.fn();

beforeEach(() => {
  cookieJar = {};
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function backendReplies(status: number, body: unknown) {
  fetchMock.mockResolvedValue({
    status,
    text: async () => (body === undefined ? "" : JSON.stringify(body)),
  });
}

const TOKEN_PAIR = {
  accessToken: "access-neu",
  refreshToken: "refresh-neu",
  user: { id: "u1", email: "a@b.de", role: "KOORDINATOR", organizationId: "o1" },
};

/** Set-Cookie der Antwort, als rohe Zeichenkette. */
function setCookie(res: Response): string {
  return res.headers.get("set-cookie") ?? "";
}

describe("POST /api/auth/session", () => {
  it("legt das Refresh-Token als httpOnly-Cookie ab", async () => {
    const { POST } = await import("../src/app/api/auth/session/route");
    const res = await POST(
      new Request("http://localhost/api/auth/session", {
        method: "POST",
        body: JSON.stringify({ refreshToken: "refresh-1" }),
      }) as never,
    );

    expect(res.status).toBe(200);
    const cookie = setCookie(res);
    expect(cookie).toContain("lenlen_rt=refresh-1");
    // Die drei Eigenschaften, um die es geht: unlesbar für Skripte, nie an
    // fremde Ursprünge angehängt, und nur auf den Auth-Pfaden überhaupt dabei.
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=strict");
    expect(cookie).toContain("Path=/api/auth");
  });

  it("weist einen Rumpf ohne Token ab", async () => {
    const { POST } = await import("../src/app/api/auth/session/route");
    const res = await POST(
      new Request("http://localhost/api/auth/session", {
        method: "POST",
        body: JSON.stringify({}),
      }) as never,
    );
    expect(res.status).toBe(400);
    expect(setCookie(res)).toBe("");
  });
});

describe("DELETE /api/auth/session", () => {
  it("widerruft im Backend und löscht das Cookie", async () => {
    cookieJar["lenlen_rt"] = "refresh-1";
    backendReplies(204, undefined);

    const { DELETE } = await import("../src/app/api/auth/session/route");
    const res = await DELETE();

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0]?.[0]).toContain("/auth/logout");
    expect(setCookie(res)).toContain("Max-Age=0");
  });

  it("löscht das Cookie auch, wenn das Backend nicht antwortet", async () => {
    // Sonst bliebe nach einem Netzfehler ein Cookie zurück, das den Benutzer
    // beim nächsten Aufruf wieder anmeldet – obwohl er abgemeldet hat.
    cookieJar["lenlen_rt"] = "refresh-1";
    fetchMock.mockRejectedValue(new Error("Netz weg"));

    const { DELETE } = await import("../src/app/api/auth/session/route");
    const res = await DELETE();

    expect(res.status).toBe(200);
    expect(setCookie(res)).toContain("Max-Age=0");
  });
});

describe("POST /api/auth/session/refresh", () => {
  it("antwortet ohne Cookie mit session: null und fragt das Backend nicht", async () => {
    const { POST } = await import("../src/app/api/auth/session/refresh/route");
    const res = await POST();

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ session: null });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("liefert den Access-Token und rotiert das Cookie", async () => {
    cookieJar["lenlen_rt"] = "refresh-alt";
    backendReplies(200, TOKEN_PAIR);

    const { POST } = await import("../src/app/api/auth/session/refresh/route");
    const res = await POST();
    const body = (await res.json()) as { session: { accessToken: string } };

    expect(body.session.accessToken).toBe("access-neu");
    // Das rotierte Token ersetzt das alte im Cookie.
    expect(setCookie(res)).toContain("lenlen_rt=refresh-neu");
    // Und es steht NICHT in der Antwort: sonst wäre die ganze Übung umsonst.
    expect(JSON.stringify(body)).not.toContain("refresh-neu");
  });

  it("räumt das Cookie ab, wenn das Token abgelaufen oder widerrufen ist", async () => {
    cookieJar["lenlen_rt"] = "refresh-alt";
    backendReplies(401, { error: "Unauthorized" });

    const { POST } = await import("../src/app/api/auth/session/refresh/route");
    const res = await POST();

    expect(await res.json()).toEqual({ session: null });
    expect(setCookie(res)).toContain("Max-Age=0");
  });

  it("lässt das Cookie bei einer Backend-Störung unangetastet", async () => {
    // Der Unterschied, auf den es ankommt: ein 500 des Backends ist keine
    // ungültige Sitzung. Würde hier gelöscht, meldete eine Störung von einer
    // Minute sämtliche Benutzer der Plattform ab.
    cookieJar["lenlen_rt"] = "refresh-alt";
    backendReplies(500, { error: "InternalServerError" });

    const { POST } = await import("../src/app/api/auth/session/refresh/route");
    const res = await POST();

    expect(res.status).toBe(502);
    expect(setCookie(res)).toBe("");
  });
});
