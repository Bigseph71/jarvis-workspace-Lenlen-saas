/**
 * Anmeldung bei einer Adresse, die es in mehreren Organisationen gibt.
 *
 * Vorher entschied allein die Zahl der Treffer über die Antwort: zwei Konten
 * mit derselben Adresse ergaben "E-Mail in mehreren Organisationen vorhanden",
 * ohne Passwort und für jeden. Über /auth/login – öffentlich, ohne Anmeldung –
 * liess sich damit abfragen, welche Adressen auf der Plattform mehrfach
 * geführt werden.
 *
 * Zugesichert wird deshalb: solange das Passwort nicht stimmt, ist die Antwort
 * immer dieselbe generische Ablehnung. Der Hinweis auf die Organisation kommt
 * nur noch, wenn er wirklich gebraucht wird – und nur an jemanden, der das
 * Passwort schon kennt.
 *
 * Läuft wie die übrigen Integrationstests nur mit RUN_DB_TESTS=1.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { assertLocalTestDatabase } from "../helpers/test-database.js";

const runDbTests = process.env.RUN_DB_TESTS === "1";

const email = `doppel+${Date.now()}@demo.de`;
const passwordA = "Passwort-Struktur-A-123";
const passwordB = "Passwort-Struktur-B-456";
const sharedEmail = `gleich+${Date.now()}@demo.de`;
const sharedPassword = "Gleiches-Passwort-Ueberall-789";

describe.skipIf(!runDbTests)("Anmeldung bei mehrfach geführter Adresse (DB)", () => {
  let prisma: typeof import("@len-len/database").prisma;
  let auth: typeof import("../../src/modules/auth/auth.service.js");
  const orgIds: string[] = [];

  /** Legt eine Organisation mit dem gegebenen Konto an und gibt ihre ID zurück. */
  async function createOrg(name: string, adminEmail: string, adminPassword: string): Promise<string> {
    const result = await auth.registerOrganization({
      organizationName: name,
      country: "DE",
      adminEmail,
      adminPassword,
    });
    orgIds.push(result.user.organizationId);
    return result.user.organizationId;
  }

  beforeAll(async () => {
    assertLocalTestDatabase(process.env.DATABASE_URL);
    ({ prisma } = await import("@len-len/database"));
    auth = await import("../../src/modules/auth/auth.service.js");

    // Dieselbe Adresse, zwei Strukturen, VERSCHIEDENE Passwörter.
    await createOrg("Doppel A GmbH", email, passwordA);
    await createOrg("Doppel B GmbH", email, passwordB);

    // Und ein zweites Paar mit demselben Passwort – der Fall, in dem die
    // Rückfrage nach der Organisation berechtigt ist.
    await createOrg("Gleich A GmbH", sharedEmail, sharedPassword);
    await createOrg("Gleich B GmbH", sharedEmail, sharedPassword);
  });

  afterAll(async () => {
    if (!prisma) return;
    for (const id of orgIds) {
      await prisma.organization.delete({ where: { id } }).catch(() => undefined);
    }
    await prisma.$disconnect();
  });

  it("verrät mit falschem Passwort nicht, dass es die Adresse mehrfach gibt", async () => {
    // Der Kern der Korrektur. Erwartet wird die generische Ablehnung, NICHT
    // der Hinweis auf mehrere Organisationen.
    const err = await auth.login({ email, password: "Falsches-Passwort-000" }).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toBe("Ungültige Anmeldedaten");
    expect((err as { statusCode?: number }).statusCode).toBe(401);
  });

  it("antwortet einer unbekannten Adresse genauso", async () => {
    const err = await auth
      .login({ email: `niemand+${Date.now()}@demo.de`, password: "Falsches-Passwort-000" })
      .catch((e: unknown) => e);

    expect((err as Error).message).toBe("Ungültige Anmeldedaten");
  });

  it("meldet mit dem Passwort der ersten Struktur genau dort an", async () => {
    // Nebeneffekt der Korrektur, und die bessere Bedienung: das Passwort
    // bestimmt die Organisation, es braucht gar keine Rückfrage.
    const result = await auth.login({ email, password: passwordA });
    expect(result.user.organizationId).toBe(orgIds[0]);
  });

  it("meldet mit dem Passwort der zweiten Struktur dort an", async () => {
    const result = await auth.login({ email, password: passwordB });
    expect(result.user.organizationId).toBe(orgIds[1]);
  });

  it("fragt nur bei echter Mehrdeutigkeit nach der Organisation", async () => {
    // Gleiches Passwort in beiden Strukturen: hier ist die Rückfrage nötig –
    // und der Fragende hat das Passwort bereits bewiesen.
    const err = await auth.login({ email: sharedEmail, password: sharedPassword }).catch((e: unknown) => e);

    expect((err as Error).message).toContain("organizationId");
    expect((err as { statusCode?: number }).statusCode).toBe(409);
  });

  it("meldet mit organizationId eindeutig an", async () => {
    const result = await auth.login({
      email: sharedEmail,
      password: sharedPassword,
      organizationId: orgIds[3],
    });
    expect(result.user.organizationId).toBe(orgIds[3]);
  });
});
