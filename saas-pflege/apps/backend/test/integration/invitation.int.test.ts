/**
 * Einladungen gegen eine ECHTE Datenbank.
 * Aktivierung wie in auth-flow.int.test.ts (RUN_DB_TESTS=1 + TEST_DATABASE_URL).
 *
 * Warum zusätzlich zum Regeltest: invitation-rules.test.ts sagt, wann ein Link
 * gelten DARF. Hier geht es um das, was danach in der Datenbank steht und was
 * die Anmeldung daraus macht – dass beim Anlegen kein Passwort entsteht, dass
 * der Klartext des Tokens nirgends gespeichert wird, und dass ein Link genau
 * einmal zieht. Das sind die Eigenschaften, wegen derer das temporäre Passwort
 * abgeschafft wurde; eine Regel allein belegt sie nicht.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { assertLocalTestDatabase } from "../helpers/test-database.js";

const runDbTests = process.env.RUN_DB_TESTS === "1";
const stamp = Date.now();
const adminEmail = `invite-admin+${stamp}@demo.de`;
const fkEmail = `invite-fk+${stamp}@demo.de`;

const ALL_DAYS = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"] as const;
const CHOSEN_PASSWORD = "Selbst-Gewaehlt-9";

interface Ctx {
  organizationId: string;
  userId: string | null;
}

/** Der Token steht am Ende des Links: .../de/invitation/<token> */
function tokenFrom(url: string): string {
  return url.slice(url.lastIndexOf("/") + 1);
}

describe.skipIf(!runDbTests)("Einladungen (DB)", () => {
  let prisma: typeof import("@len-len/database").prisma;
  let users: typeof import("../../src/modules/users/user.service.js");
  let invitations: typeof import("../../src/modules/users/invitation.service.js");
  let auth: typeof import("../../src/modules/auth/auth.service.js");

  let organizationId: string;
  let adminCtx: Ctx;
  let caregiverId: string;
  let fachkraftUserId: string;
  let firstToken: string;

  beforeAll(async () => {
    assertLocalTestDatabase(process.env.DATABASE_URL);

    ({ prisma } = await import("@len-len/database"));
    auth = await import("../../src/modules/auth/auth.service.js");
    users = await import("../../src/modules/users/user.service.js");
    invitations = await import("../../src/modules/users/invitation.service.js");
    const caregivers = await import("../../src/modules/caregivers/caregiver.service.js");

    const registered = await auth.registerOrganization({
      organizationName: "EinladungTest GmbH",
      country: "DE",
      adminEmail,
      adminPassword: "Sehr-Sicher-123",
    });
    organizationId = registered.user.organizationId;
    await prisma.organization.update({
      where: { id: organizationId },
      data: { subscriptionStatus: "ACTIVE" },
    });
    adminCtx = { organizationId, userId: registered.user.id };

    const cg = (await caregivers.createCaregiver(adminCtx, {
      firstName: "Nadja",
      lastName: "Einladung",
      qualification: "PFLEGEFACHKRAFT",
      contractType: "FULL_100",
      weeklyHours: 39,
      workDays: [...ALL_DAYS],
      maxPatients: 10,
      validFrom: new Date("2026-01-01T00:00:00.000Z"),
    })) as { id: string };
    caregiverId = cg.id;
  });

  afterAll(async () => {
    if (!prisma) return;
    if (organizationId) await prisma.organization.delete({ where: { id: organizationId } });
    await prisma.$disconnect();
  });

  it("das Anlegen liefert einen Link und kein Passwort", async () => {
    const account = await users.createFachkraftUser(adminCtx, {
      caregiverId,
      email: fkEmail,
      language: "DE",
    });
    fachkraftUserId = account.user.id;
    firstToken = tokenFrom(account.invitationUrl);

    expect(account.invitationUrl).toContain("/de/invitation/");
    expect(account.invitationExpiresAt.getTime()).toBeGreaterThan(Date.now());
    // Der eigentliche Punkt der Umstellung: in der Antwort steht nichts, womit
    // der Admin sich als die Fachkraft anmelden könnte.
    expect(JSON.stringify(account)).not.toContain("temporaryPassword");
  });

  it("speichert den Token nur gehasht", async () => {
    const rows = await prisma.userInvitation.findMany({ where: { userId: fachkraftUserId } });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.tokenHash).not.toBe(firstToken);
    expect(rows[0]!.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(rows[0]!.usedAt).toBeNull();
  });

  it("zeigt vor dem Einlösen, für welches Konto der Link gilt", async () => {
    const preview = await invitations.previewInvitation(firstToken);
    expect(preview.email).toBe(fkEmail);
    expect(preview.organizationName).toBe("EinladungTest GmbH");
  });

  it("weist einen erfundenen Token ab", async () => {
    await expect(invitations.previewInvitation("nicht-existent-aaaaaaaaaaaa")).rejects.toMatchObject(
      { statusCode: 404 },
    );
  });

  it("das Konto ist vor dem Einlösen nicht anmeldbar", async () => {
    // Es gibt kein Passwort, das jemand kennen könnte – auch kein temporäres.
    await expect(
      auth.login({ email: fkEmail, password: CHOSEN_PASSWORD, organizationId }),
    ).rejects.toMatchObject({ statusCode: 401 });
  });

  it("nach dem Einlösen gilt das selbst gewählte Passwort", async () => {
    const accepted = await invitations.acceptInvitation(firstToken, CHOSEN_PASSWORD);
    expect(accepted.email).toBe(fkEmail);

    const loggedIn = await auth.login({
      email: fkEmail,
      password: CHOSEN_PASSWORD,
      organizationId,
    });
    expect(loggedIn.user.id).toBe(fachkraftUserId);
    // Sie hat es selbst gewählt – es gibt nichts mehr zu wechseln.
    expect(loggedIn.user.mustChangePassword).toBe(false);
  });

  it("derselbe Link zieht kein zweites Mal", async () => {
    // Sonst könnte ein weitergeleiteter Link das Konto später übernehmen.
    await expect(
      invitations.acceptInvitation(firstToken, "Ein-Anderes-Pw-7"),
    ).rejects.toMatchObject({ statusCode: 404 });

    // Und das gesetzte Passwort steht unverändert.
    await expect(
      auth.login({ email: fkEmail, password: CHOSEN_PASSWORD, organizationId }),
    ).resolves.toBeTruthy();
  });

  it("ein neuer Link entwertet den vorherigen und beendet die Sitzungen", async () => {
    const first = await users.reissueInvitation(adminCtx, fachkraftUserId);
    const second = await users.reissueInvitation(adminCtx, fachkraftUserId);

    // Zwei gültige Links nebeneinander wären genau das, was man beim erneuten
    // Ausstellen verhindern will: der Grund dafür ist meist der Verdacht, der
    // erste sei in falsche Hände geraten.
    await expect(
      invitations.previewInvitation(tokenFrom(first.invitationUrl)),
    ).rejects.toMatchObject({ statusCode: 404 });
    await expect(
      invitations.previewInvitation(tokenFrom(second.invitationUrl)),
    ).resolves.toBeTruthy();

    // Die Anmeldung von vorhin ist beendet.
    const offen = await prisma.refreshToken.count({
      where: { userId: fachkraftUserId, revokedAt: null },
    });
    expect(offen).toBe(0);
  });

  it("das bisherige Passwort bleibt gültig, bis der neue Link eingelöst ist", async () => {
    // Ein ausgestellter Link darf niemanden aussperren: er kann auf dem Weg
    // verloren gehen, und dann muss die Fachkraft weiterarbeiten können.
    await expect(
      auth.login({ email: fkEmail, password: CHOSEN_PASSWORD, organizationId }),
    ).resolves.toBeTruthy();
  });
});
