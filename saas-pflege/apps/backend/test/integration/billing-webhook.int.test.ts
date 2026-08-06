/**
 * Cycle de vie d'un abonnement Stripe, contre une VRAIE base.
 * Activation : RUN_DB_TESTS=1 + TEST_DATABASE_URL (voir auth-flow.int.test.ts).
 *
 * Ce qui se joue ici et qu'aucun test unitaire ne couvre : l'effet réel des
 * webhooks sur le tenant (plan, statut, fenêtre de karenzzeit, historique des
 * factures) et l'idempotence, qui repose sur une contrainte de la base.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { assertLocalTestDatabase } from "../helpers/test-database.js";

const runDbTests = process.env.RUN_DB_TESTS === "1";
const email = `billing+${Date.now()}@demo.de`;
const CUSTOMER = `cus_test_${Date.now()}`;
const SUBSCRIPTION = `sub_test_${Date.now()}`;

const event = (type: string, object: Record<string, unknown>, id?: string) => ({
  id: id ?? `evt_${type}_${Math.random().toString(36).slice(2)}`,
  type,
  data: { object },
});

describe.skipIf(!runDbTests)("Abo-Lebenszyklus über Webhooks (DB)", () => {
  let prisma: typeof import("@len-len/database").prisma;
  let billing: typeof import("../../src/modules/billing/billing.service.js");
  let organizationId: string;

  const org = async () =>
    prisma.organization.findUniqueOrThrow({
      where: { id: organizationId },
      select: {
        subscriptionPlan: true,
        subscriptionStatus: true,
        pastDueSince: true,
        stripeCustomerId: true,
        stripeSubscriptionId: true,
      },
    });

  beforeAll(async () => {
    assertLocalTestDatabase(process.env.DATABASE_URL);
    ({ prisma } = await import("@len-len/database"));
    const auth = await import("../../src/modules/auth/auth.service.js");
    billing = await import("../../src/modules/billing/billing.service.js");

    const result = await auth.registerOrganization({
      organizationName: "AboTest GmbH",
      country: "DE",
      adminEmail: email,
      adminPassword: "Sehr-Sicher-123",
    });
    organizationId = result.user.organizationId;
  });

  afterAll(async () => {
    if (!prisma) return;
    const orgId =
      organizationId ??
      (await prisma.user.findFirst({ where: { email }, select: { organizationId: true } }))
        ?.organizationId;
    if (orgId) await prisma.organization.delete({ where: { id: orgId } });
    await prisma.billingWebhookEvent.deleteMany({ where: { type: { startsWith: "test." } } });
    await prisma.$disconnect();
  });

  it("un abo souscrit avant le checkout se rattache par les métadonnées", async () => {
    // customer.subscription.created peut précéder checkout.session.completed :
    // le tenant n'a alors pas encore de stripeCustomerId.
    await billing.handleStripeEvent(
      event("customer.subscription.created", {
        id: SUBSCRIPTION,
        customer: CUSTOMER,
        status: "active",
        metadata: { organizationId, plan: "BASIC" },
      }),
    );

    const after = await org();
    expect(after.stripeCustomerId).toBe(CUSTOMER);
    expect(after.subscriptionStatus).toBe("ACTIVE");
  });

  it("checkout.session.completed pose le plan et les identifiants Stripe", async () => {
    await billing.handleStripeEvent(
      event("checkout.session.completed", {
        customer: CUSTOMER,
        subscription: SUBSCRIPTION,
        metadata: { organizationId, plan: "BASIC" },
      }),
    );

    const after = await org();
    expect(after.subscriptionPlan).toBe("BASIC");
    expect(after.subscriptionStatus).toBe("ACTIVE");
    expect(after.stripeSubscriptionId).toBe(SUBSCRIPTION);
    expect(after.pastDueSince).toBeNull();
  });

  it("payment_failed ouvre la karenzzeit et la facture entre dans l'historique", async () => {
    await billing.handleStripeEvent(
      event("invoice.payment_failed", {
        id: `in_test_${Date.now()}`,
        customer: CUSTOMER,
        number: "R-001",
        amount_due: 4900,
        amount_paid: 0,
        currency: "eur",
        status: "open",
        created: Math.floor(Date.now() / 1000),
      }),
    );

    const after = await org();
    expect(after.subscriptionStatus).toBe("PAST_DUE");
    expect(after.pastDueSince).not.toBeNull();

    const invoices = await prisma.invoice.findMany({ where: { organizationId } });
    expect(invoices).toHaveLength(1);
    expect(invoices[0]!.status).toBe("FAILED");
    expect(invoices[0]!.amountDue).toBe(4900);
  });

  it("un second échec ne redémarre pas la karenzzeit", async () => {
    const before = (await org()).pastDueSince;
    await new Promise((r) => setTimeout(r, 20));

    await billing.handleStripeEvent(
      event("invoice.payment_failed", {
        id: `in_test_retry_${Date.now()}`,
        customer: CUSTOMER,
        amount_due: 4900,
        currency: "eur",
        status: "open",
        created: Math.floor(Date.now() / 1000),
      }),
    );

    // Sinon les Smart Retries de Stripe repousseraient la suspension à l'infini.
    expect((await org()).pastDueSince?.getTime()).toBe(before?.getTime());
  });

  it("le paiement réussi referme la karenzzeit", async () => {
    await billing.handleStripeEvent(
      event("invoice.payment_succeeded", {
        id: `in_test_ok_${Date.now()}`,
        customer: CUSTOMER,
        amount_due: 4900,
        amount_paid: 4900,
        currency: "eur",
        status: "paid",
        created: Math.floor(Date.now() / 1000),
      }),
    );

    const after = await org();
    expect(after.subscriptionStatus).toBe("ACTIVE");
    expect(after.pastDueSince).toBeNull();
  });

  it("subscription.deleted passe le tenant en CANCELED", async () => {
    await billing.handleStripeEvent(
      event("customer.subscription.deleted", { id: SUBSCRIPTION, customer: CUSTOMER }),
    );
    expect((await org()).subscriptionStatus).toBe("CANCELED");
  });

  it("un event rejoué est ignoré (Stripe livre at-least-once)", async () => {
    const replay = event("checkout.session.completed", {
      customer: CUSTOMER,
      subscription: SUBSCRIPTION,
      metadata: { organizationId, plan: "PRO" },
    });

    await billing.handleStripeEvent(replay); // 1re fois : applique PRO
    expect((await org()).subscriptionPlan).toBe("PRO");

    // Remise à CANCELED pour rendre visible un éventuel retraitement.
    await prisma.organization.update({
      where: { id: organizationId },
      data: { subscriptionStatus: "CANCELED" },
    });

    await billing.handleStripeEvent(replay); // même id : doit être écarté
    expect((await org()).subscriptionStatus).toBe("CANCELED");
  });

  it("un changement de prix hors de notre API met à jour le plan et les limites", async () => {
    // Cas réel : le client change de plan depuis le portail Stripe. Stripe
    // change alors le PRIX de l'abonnement mais laisse les métadonnées posées
    // au checkout sur l'ancien plan. Lire le plan dans les métadonnées
    // réécrirait donc l'ancien plan à chaque passage.
    await billing.handleStripeEvent(
      event("customer.subscription.updated", {
        id: SUBSCRIPTION,
        customer: CUSTOMER,
        status: "active",
        metadata: { organizationId, plan: "PRO" }, // périmé, doit être ignoré
        items: { data: [{ id: "si_1", price: { id: "price_test_basic" } }] },
      }),
    );

    const after = await org();
    expect(after.subscriptionPlan).toBe("BASIC");
    expect(after.subscriptionStatus).toBe("ACTIVE");

    // Les limites doivent suivre le plan, sinon l'application continuerait
    // d'autoriser les volumes de l'ancien plan (limits.ts lit planLimits).
    const { planLimits } = await prisma.organization.findUniqueOrThrow({
      where: { id: organizationId },
      select: { planLimits: true },
    });
    expect((planLimits as { patients?: number }).patients).toBe(100);
  });

  it("un prix inconnu laisse le plan inchangé", async () => {
    await billing.handleStripeEvent(
      event("customer.subscription.updated", {
        id: SUBSCRIPTION,
        customer: CUSTOMER,
        status: "active",
        items: { data: [{ id: "si_1", price: { id: "price_deal_negocie" } }] },
      }),
    );

    // Un prix négocié créé à la main dans Stripe ne doit pas faire deviner un
    // plan : mieux vaut ne rien toucher que rétrograder le tenant par erreur.
    expect((await org()).subscriptionPlan).toBe("BASIC");
  });
});
