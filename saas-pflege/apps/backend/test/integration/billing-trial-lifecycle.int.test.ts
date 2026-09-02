/**
 * Testphase eines Abos, gegen eine ECHTE Datenbank.
 * Aktivierung : RUN_DB_TESTS=1 + TEST_DATABASE_URL (siehe auth-flow.int.test.ts).
 *
 * Diese Datei spielt die Ereignisfolge nach, die Stripe beim Start eines Abos
 * mit `trial_period_days` TATSÄCHLICH liefert – und an der die Anwendung in
 * Produktion gescheitert ist. Alle drei Events treffen im selben Augenblick
 * ein, und zwei davon bedeuten für sich genommen ACTIVE:
 *
 *   customer.subscription.created  (status trialing)   -> TRIAL
 *   checkout.session.completed                         -> ACTIVE
 *   invoice.payment_succeeded      (Rechnung über 0 €) -> ACTIVE
 *
 * Ergebnis vor dem Fix: jeder Tenant stand direkt nach dem Checkout auf ACTIVE,
 * mit einer Testphase, die noch zwei Wochen lief. Der MRR zählte sie als
 * Umsatz, und die Warnung "Testphase endet bald" lief nie an.
 *
 * Ein Unit-Test kann das nicht zeigen: der Fehler steckt in der REIHENFOLGE
 * mehrerer Schreibvorgänge auf dieselbe Zeile.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { assertLocalTestDatabase } from "../helpers/test-database.js";

const runDbTests = process.env.RUN_DB_TESTS === "1";
const stamp = Date.now();
const email = `trial+${stamp}@demo.de`;
const CUSTOMER = `cus_trial_${stamp}`;
const SUBSCRIPTION = `sub_trial_${stamp}`;

const DAY = 86_400_000;
const trialEndUnix = (offsetDays: number): number =>
  Math.floor((Date.now() + offsetDays * DAY) / 1000);

const event = (type: string, object: Record<string, unknown>) => ({
  id: `evt_${type}_${Math.random().toString(36).slice(2)}`,
  type,
  data: { object },
});

describe.skipIf(!runDbTests)("Testphase über Webhooks (DB)", () => {
  let prisma: typeof import("@len-len/database").prisma;
  let billing: typeof import("../../src/modules/billing/billing.service.js");
  let organizationId: string;

  const org = async () =>
    prisma.organization.findUniqueOrThrow({
      where: { id: organizationId },
      select: { subscriptionStatus: true, trialEndsAt: true, stripeCustomerId: true },
    });

  beforeAll(async () => {
    assertLocalTestDatabase(process.env.DATABASE_URL);
    ({ prisma } = await import("@len-len/database"));
    const auth = await import("../../src/modules/auth/auth.service.js");
    billing = await import("../../src/modules/billing/billing.service.js");

    const result = await auth.registerOrganization({
      organizationName: "TestphaseTest GmbH",
      country: "DE",
      adminEmail: email,
      adminPassword: "Sehr-Sicher-123",
    });
    organizationId = result.user.organizationId;
    // Bewusst NICHT freigeschaltet: der Ausgangszustand ist hier Teil der
    // Prüfung.
  });

  afterAll(async () => {
    if (!prisma) return;
    if (organizationId) await prisma.organization.delete({ where: { id: organizationId } });
    await prisma.$disconnect();
  });

  it("die Registrierung legt den Tenant GESPERRT und ohne Testphase an", async () => {
    // Die Testphase hängt am Stripe-Abo, nicht an der Registrierung. Ohne
    // Zahlungsmittel ist der Tenant gesperrt und die Plan-Prüfung weist jeden
    // Schreibzugriff mit 402 ab.
    const after = await org();
    expect(after.subscriptionStatus).toBe("SUSPENDED");
    expect(after.trialEndsAt).toBeNull();
    expect(after.stripeCustomerId).toBeNull();
  });

  it("das Abo im Status trialing setzt TRIAL samt Frist", async () => {
    await billing.handleStripeEvent(
      event("customer.subscription.created", {
        id: SUBSCRIPTION,
        customer: CUSTOMER,
        status: "trialing",
        trial_end: trialEndUnix(14),
        metadata: { organizationId, plan: "BASIC" },
      }),
    );

    const after = await org();
    expect(after.subscriptionStatus).toBe("TRIAL");
    expect(after.trialEndsAt).not.toBeNull();
    expect(after.stripeCustomerId).toBe(CUSTOMER);
  });

  it("checkout.session.completed beendet die laufende Testphase NICHT", async () => {
    await billing.handleStripeEvent(
      event("checkout.session.completed", {
        customer: CUSTOMER,
        subscription: SUBSCRIPTION,
        metadata: { organizationId, plan: "BASIC" },
      }),
    );

    expect((await org()).subscriptionStatus).toBe("TRIAL");
  });

  it("die Rechnung über 0 € beendet die laufende Testphase NICHT", async () => {
    // Der eigentliche Fehler. Stripe stellt zu Beginn der Testphase eine
    // Rechnung über 0 € aus und bezahlt sie sofort.
    await billing.handleStripeEvent(
      event("invoice.payment_succeeded", {
        id: `in_trial_${stamp}`,
        customer: CUSTOMER,
        number: "R-000",
        amount_due: 0,
        amount_paid: 0,
        currency: "eur",
        status: "paid",
        created: Math.floor(Date.now() / 1000),
      }),
    );

    const after = await org();
    expect(after.subscriptionStatus).toBe("TRIAL");
    expect(after.trialEndsAt).not.toBeNull();
  });

  it("das Ende der Testphase kommt aus dem Abo-Objekt und räumt die Frist ab", async () => {
    // Stripe lässt `trial_end` nach dem Ende am Abo STEHEN – es ist dort eine
    // historische Angabe. Nur darauf zu schauen hiesse, das Datum ewig
    // mitzuschleppen und einen zahlenden Tenant mit einer abgelaufenen
    // Testphase anzuzeigen.
    await billing.handleStripeEvent(
      event("customer.subscription.updated", {
        id: SUBSCRIPTION,
        customer: CUSTOMER,
        status: "active",
        trial_end: trialEndUnix(-1),
        metadata: { organizationId, plan: "BASIC" },
      }),
    );

    const after = await org();
    expect(after.subscriptionStatus).toBe("ACTIVE");
    expect(after.trialEndsAt).toBeNull();
  });

  it("nach einem Zahlungsausfall schaltet die erfolgreiche Zahlung wieder frei", async () => {
    // Gegenprobe: der Schutz darf nur eine LAUFENDE Testphase betreffen. Ein
    // Schutz ohne diese Grenze hätte den Tenant nach einem Ausfall in PAST_DUE
    // stehen lassen.
    await billing.handleStripeEvent(
      event("invoice.payment_failed", {
        id: `in_fail_${stamp}`,
        customer: CUSTOMER,
        amount_due: 4900,
        currency: "eur",
        status: "open",
        created: Math.floor(Date.now() / 1000),
      }),
    );
    expect((await org()).subscriptionStatus).toBe("PAST_DUE");

    await billing.handleStripeEvent(
      event("invoice.payment_succeeded", {
        id: `in_ok_${stamp}`,
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
    expect(after.trialEndsAt).toBeNull();
  });

  it("eine ABGELAUFENE Testphase blockiert die Zahlung nicht", async () => {
    // Sonst bliebe ein Tenant für immer in TRIAL: die Frist wäre vorbei, aber
    // kein Zahlungs-Event dürfte ihn je auf ACTIVE ziehen.
    await prisma.organization.update({
      where: { id: organizationId },
      data: { subscriptionStatus: "TRIAL", trialEndsAt: new Date(Date.now() - DAY) },
    });

    await billing.handleStripeEvent(
      event("invoice.payment_succeeded", {
        id: `in_after_trial_${stamp}`,
        customer: CUSTOMER,
        amount_due: 4900,
        amount_paid: 4900,
        currency: "eur",
        status: "paid",
        created: Math.floor(Date.now() / 1000),
      }),
    );

    expect((await org()).subscriptionStatus).toBe("ACTIVE");
  });
});
