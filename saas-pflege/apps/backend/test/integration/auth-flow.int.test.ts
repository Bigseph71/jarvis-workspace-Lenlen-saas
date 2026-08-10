/**
 * Integrationstest des Auth-Flows gegen eine ECHTE Datenbank.
 *
 * Standardmäßig übersprungen. Aktivieren:
 *   1. Postgres starten und TEST_DATABASE_URL auf eine migrierte Test-DB
 *      setzen (pnpm --filter @len-len/database migrate:deploy && … rls).
 *      NICHT die Anwendungs-DATABASE_URL: dieser Test legt einen Tenant an
 *      und löscht ihn wieder.
 *   2. RUN_DB_TESTS=1 setzen
 *   3. pnpm --filter @len-len/backend test
 *
 * Zwei Sicherungen: vitest.config.ts überschreibt DATABASE_URL, die
 * Anwendungs-URL erreicht den Test also nie von selbst; und
 * assertLocalTestDatabase weist eine nicht-lokale URL ab, falls doch eine
 * gesetzt wird.
 *
 * Imports sind dynamisch, damit dieser File ohne generierten Prisma-Client /
 * ohne DB nicht beim Laden scheitert (die reinen Unit-Tests bleiben lauffähig).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { assertLocalTestDatabase } from "../helpers/test-database.js";

const runDbTests = process.env.RUN_DB_TESTS === "1";
const email = `admin+${Date.now()}@demo.de`;
const password = "Sehr-Sicher-123";

describe.skipIf(!runDbTests)("Auth-Flow (DB)", () => {
  let prisma: typeof import("@len-len/database").prisma;
  let auth: typeof import("../../src/modules/auth/auth.service.js");
  let organizationId: string;

  beforeAll(async () => {
    // Vor dem ersten Import: der Prisma-Client liest DATABASE_URL beim Bauen.
    assertLocalTestDatabase(process.env.DATABASE_URL);

    ({ prisma } = await import("@len-len/database"));
    auth = await import("../../src/modules/auth/auth.service.js");

    const result = await auth.registerOrganization({
      organizationName: "IntegrationsTest GmbH",
      country: "DE",
      adminEmail: email,
      adminPassword: password,
    });
    organizationId = result.user.organizationId;
    // Die Registrierung legt den Tenant GESPERRT an (Zahlungsmittel
    // erforderlich). Diese Tests prüfen die Fachlichkeit, nicht die
    // Abrechnung – deshalb hier freischalten, sonst weist assertWithinPlan
    // jedes Anlegen mit 402 ab.
    await prisma.organization.update({
      where: { id: organizationId },
      data: { subscriptionStatus: "ACTIVE" },
    });
  });

  afterAll(async () => {
    // Scheitert schon die Garde in beforeAll, gibt es keinen Client und nichts
    // aufzuräumen. Ohne diese Zeile verdeckt ein TypeError die eigentliche
    // Fehlermeldung.
    if (!prisma) return;

    // Der Tenant wird über die E-Mail nachgeschlagen, falls organizationId
    // nicht steht: registerOrganization committet den Tenant, bevor es die
    // Token ausstellt – scheitert dieser zweite Schritt, existiert der Tenant
    // trotzdem und bliebe sonst als Leiche in der DB zurück.
    const orgId =
      organizationId ??
      (await prisma.user.findFirst({ where: { email }, select: { organizationId: true } }))
        ?.organizationId;

    // Bewusst ohne catch: ein misslungenes Aufräumen MUSS auffallen, sonst
    // sammeln sich Test-Tenants unbemerkt an.
    if (orgId) await prisma.organization.delete({ where: { id: orgId } });
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
