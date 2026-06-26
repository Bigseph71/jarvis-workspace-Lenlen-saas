/**
 * Integrationstest des Auth-Flows gegen eine ECHTE Datenbank.
 *
 * Standardmäßig übersprungen. Aktivieren:
 *   1. Postgres starten, DATABASE_URL auf eine migrierte Test-DB setzen
 *      (pnpm --filter @len-len/database migrate:deploy && pnpm --filter @len-len/database rls)
 *   2. RUN_DB_TESTS=1 setzen
 *   3. pnpm --filter @len-len/backend test
 *
 * Imports sind dynamisch, damit dieser File ohne generierten Prisma-Client /
 * ohne DB nicht beim Laden scheitert (die reinen Unit-Tests bleiben lauffähig).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";

const runDbTests = process.env.RUN_DB_TESTS === "1";
const email = `admin+${Date.now()}@demo.de`;
const password = "Sehr-Sicher-123";

describe.skipIf(!runDbTests)("Auth-Flow (DB)", () => {
  let prisma: typeof import("@len-len/database").prisma;
  let auth: typeof import("../../src/modules/auth/auth.service.js");
  let organizationId: string;

  beforeAll(async () => {
    ({ prisma } = await import("@len-len/database"));
    auth = await import("../../src/modules/auth/auth.service.js");

    const result = await auth.registerOrganization({
      organizationName: "IntegrationsTest GmbH",
      country: "DE",
      adminEmail: email,
      adminPassword: password,
    });
    organizationId = result.user.organizationId;
  });

  afterAll(async () => {
    if (organizationId) {
      await prisma.organization.delete({ where: { id: organizationId } }).catch(() => undefined);
    }
    await prisma.$disconnect();
  });

  it("login liefert Access- und Refresh-Token", async () => {
    const result = await auth.login({ email, password });
    expect(result.accessToken).toBeTruthy();
    expect(result.refreshToken).toBeTruthy();
    expect(result.user.email).toBe(email);
  });

  it("rotiert das Refresh-Token und erkennt Wiederverwendung", async () => {
    const first = await auth.login({ email, password });
    const rotated = await auth.rotateRefreshToken(first.refreshToken);
    expect(rotated.refreshToken).not.toBe(first.refreshToken);

    // Wiederverwendung des alten (widerrufenen) Tokens muss scheitern.
    await expect(auth.rotateRefreshToken(first.refreshToken)).rejects.toThrow();
  });
});
