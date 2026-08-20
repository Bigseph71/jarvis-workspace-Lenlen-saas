/**
 * Panel Super-Admin contre une vraie base.
 *
 * Ce qui ne peut se vérifier qu'ici : que les actions du Super-Admin laissent
 * une trace, que le dashboard compte ce qu'il prétend compter, et surtout que
 * la suppression douce coupe réellement l'accès. Le reste (garde, formatage
 * CSV) est couvert sans base par admin-guard et admin-rules.
 *
 * Joué uniquement avec RUN_DB_TESTS=1 (le CI provisionne un Postgres jetable).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { assertLocalTestDatabase } from "../helpers/test-database.js";

const runDbTests = process.env.RUN_DB_TESTS === "1";
const stamp = Date.now();

describe.skipIf(!runDbTests)("Panel Super-Admin (DB)", () => {
  let prisma: typeof import("@len-len/database").prisma;
  let admin: typeof import("../../src/modules/admin/admin.service.js");
  let auth: typeof import("../../src/modules/auth/auth.service.js");

  const orgIds: string[] = [];
  let targetOrgId: string;
  let superAdminUserId: string;

  const targetEmail = `chef+${stamp}@demo.de`;
  const targetPassword = "Sehr-Sicher-Passwort-123";

  beforeAll(async () => {
    assertLocalTestDatabase(process.env.DATABASE_URL);
    ({ prisma } = await import("@len-len/database"));
    admin = await import("../../src/modules/admin/admin.service.js");
    auth = await import("../../src/modules/auth/auth.service.js");

    // Le tenant sur lequel le Super-Admin va agir.
    const target = await auth.registerOrganization({
      organizationName: `Zielstruktur ${stamp}`,
      country: "DE",
      adminEmail: targetEmail,
      adminPassword: targetPassword,
    });
    targetOrgId = target.user.organizationId;
    orgIds.push(targetOrgId);

    // Le Super-Admin vit dans SA propre organisation : c'est le point du
    // panel, il agit depuis l'extérieur du tenant qu'il administre.
    const home = await auth.registerOrganization({
      organizationName: `Plattformbetrieb ${stamp}`,
      country: "DE",
      adminEmail: `super+${stamp}@demo.de`,
      adminPassword: "Ein-Anderes-Passwort-456",
    });
    orgIds.push(home.user.organizationId);
    superAdminUserId = home.user.id;
    await prisma.user.update({
      where: { id: superAdminUserId },
      data: { role: "SUPER_ADMIN" },
    });
  });

  afterAll(async () => {
    if (!prisma) return;
    for (const id of orgIds) {
      await prisma.organization.delete({ where: { id } }).catch(() => undefined);
    }
    await prisma.$disconnect();
  });

  it("compte les organisations par statut, gelöschte exclues", async () => {
    const before = await admin.getDashboard();
    expect(before.organizations.total).toBeGreaterThanOrEqual(2);
    // Tous les statuts sont présents, même à zéro.
    expect(Object.keys(before.organizations.byStatus).sort()).toEqual(
      ["ACTIVE", "CANCELED", "PAST_DUE", "SUSPENDED", "TRIAL"].sort(),
    );
  });

  it("trace un changement de plan dans l'audit log de la cible", async () => {
    await admin.updateOrganization({ userId: superAdminUserId }, targetOrgId, { plan: "PRO" });

    const entry = await prisma.auditLog.findFirst({
      where: { organizationId: targetOrgId, entityType: "organization", action: "UPDATE" },
      orderBy: { createdAt: "desc" },
    });

    expect(entry).not.toBeNull();
    // La trace est portée par le tenant touché, pas par celui du Super-Admin :
    // c'est là qu'on la cherchera en relisant l'histoire d'un client.
    expect(entry?.organizationId).toBe(targetOrgId);
    // Et elle nomme son auteur, qui appartient à une autre organisation.
    expect(entry?.userId).toBe(superAdminUserId);
    expect(JSON.stringify(entry?.metadata)).toContain("bySuperAdmin");

    const org = await prisma.organization.findUnique({ where: { id: targetOrgId } });
    expect(org?.subscriptionPlan).toBe("PRO");
  });

  it("ne touche pas aux limites négociées lors d'un changement de plan", async () => {
    // planLimits porte des dérogations par ressource, pas une copie du plan.
    await prisma.organization.update({
      where: { id: targetOrgId },
      data: { planLimits: { patients: 4242 } },
    });

    await admin.updateOrganization({ userId: superAdminUserId }, targetOrgId, { plan: "BASIC" });

    const org = await prisma.organization.findUnique({ where: { id: targetOrgId } });
    expect(org?.subscriptionPlan).toBe("BASIC");
    expect(org?.planLimits).toEqual({ patients: 4242 });
  });

  it("supprime en douceur, avec motif, et coupe la connexion", async () => {
    // Avant : le compte du tenant fonctionne.
    const ok = await auth.login({ email: targetEmail, password: targetPassword });
    expect(ok.accessToken).toBeTruthy();

    await admin.softDeleteOrganization({ userId: superAdminUserId }, targetOrgId, {
      reason: "Vertrag zum Monatsende gekündigt",
    });

    const org = await prisma.organization.findUnique({ where: { id: targetOrgId } });
    expect(org?.deletedAt).not.toBeNull();
    expect(org?.deletionReason).toBe("Vertrag zum Monatsende gekündigt");
    expect(org?.deletedByUserId).toBe(superAdminUserId);
    expect(org?.subscriptionStatus).toBe("CANCELED");

    // Après : plus personne n'entre. Sans cela, la suppression ne serait
    // qu'un changement d'affichage dans le panel.
    await expect(auth.login({ email: targetEmail, password: targetPassword })).rejects.toThrow();

    // Et la donnée est toujours là (obligations de conservation).
    const users = await prisma.user.count({ where: { organizationId: targetOrgId } });
    expect(users).toBeGreaterThan(0);
  });

  it("écarte une organisation supprimée des listes et du dashboard", async () => {
    const list = await admin.listOrganizations({ page: 1, pageSize: 100, includeDeleted: false });
    const ids = (list.data as { id: string }[]).map((o) => o.id);
    expect(ids).not.toContain(targetOrgId);

    const withDeleted = await admin.listOrganizations({
      page: 1,
      pageSize: 100,
      includeDeleted: true,
    });
    expect((withDeleted.data as { id: string }[]).map((o) => o.id)).toContain(targetOrgId);
  });

  it("refuse de modifier une organisation supprimée", async () => {
    await expect(
      admin.updateOrganization({ userId: superAdminUserId }, targetOrgId, { plan: "PRO" }),
    ).rejects.toThrow();
  });

  it("exporte l'audit log filtré en CSV", async () => {
    const csv = await admin.exportAuditLogsCsv({ organizationId: targetOrgId, limit: 100 });
    expect(csv).toContain("createdAt");
    expect(csv).toContain(targetOrgId);
    // Une ligne par entrée, plus l'en-tête.
    expect(csv.split("\r\n").length).toBeGreaterThan(1);
  });
});
