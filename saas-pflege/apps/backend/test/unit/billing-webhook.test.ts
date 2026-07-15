import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * In-Memory-Doppel des Prisma-Clients. Der Webhook-Pfad läuft bewusst OHNE
 * Tenant-Kontext (System-Pfad), berührt also nur `prisma` – genau diese Aufrufe
 * zeichnen wir auf und prüfen sie.
 */
interface RecordedCall {
  method: string;
  args: Record<string, unknown>;
}

const calls: RecordedCall[] = [];
// Bereits zugestellte Event-IDs (simuliert den Primärschlüssel der Tabelle).
const seenEvents = new Set<string>();
let organizationForCustomer: { id: string } | null = { id: "org-1" };

function record(method: string, args: Record<string, unknown>): Record<string, unknown> {
  calls.push({ method, args });
  return args;
}

function uniqueViolation(): Error {
  return new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
    code: "P2002",
    clientVersion: "5.22.0",
  });
}

const prismaMock = {
  billingWebhookEvent: {
    create: vi.fn(async ({ data }: { data: { id: string; type: string } }) => {
      if (seenEvents.has(data.id)) throw uniqueViolation();
      seenEvents.add(data.id);
      return record("billingWebhookEvent.create", { data });
    }),
    delete: vi.fn(async ({ where }: { where: { id: string } }) => {
      seenEvents.delete(where.id);
      return record("billingWebhookEvent.delete", { where });
    }),
  },
  organization: {
    update: vi.fn(async (args: Record<string, unknown>) => record("organization.update", args)),
    updateMany: vi.fn(async (args: Record<string, unknown>) => {
      record("organization.updateMany", args);
      return { count: 1 };
    }),
    findFirst: vi.fn(async (args: Record<string, unknown>) => {
      record("organization.findFirst", args);
      return organizationForCustomer;
    }),
  },
  invoice: {
    upsert: vi.fn(async (args: Record<string, unknown>) => record("invoice.upsert", args)),
  },
};

vi.mock("@len-len/database", async () => {
  const actual = await vi.importActual<typeof import("@len-len/database")>("@len-len/database");
  return { ...actual, prisma: prismaMock };
});

// Dynamisch NACH der vi.mock-Registrierung importieren: die Mock-Factory
// referenziert `prismaMock`, das zum Zeitpunkt statischer Imports noch nicht
// initialisiert wäre. `Prisma` stammt aus dem echten Modul (die Factory reicht
// `...actual` durch) – nur so ist die Fehlerklasse identisch zu der, gegen die
// der Service per instanceof prüft.
const { Prisma } = await import("@len-len/database");
const { handleStripeEvent } = await import("../../src/modules/billing/billing.service.js");

/** Findet die Aufrufe eines Prisma-Modells/Methodenpaars. */
function callsTo(method: string): Record<string, unknown>[] {
  return calls.filter((c) => c.method === method).map((c) => c.args);
}

/** Baut ein Stripe-Event im Format, das der Provider liefert. */
function event(type: string, object: Record<string, unknown>, id?: string) {
  return { ...(id ? { id } : {}), type, data: { object } };
}

beforeEach(() => {
  calls.length = 0;
  seenEvents.clear();
  organizationForCustomer = { id: "org-1" };
  vi.clearAllMocks();
});

describe("handleStripeEvent – Idempotenz", () => {
  it("verarbeitet dasselbe Event nur EINMAL (Stripe liefert at-least-once)", async () => {
    const evt = event("customer.subscription.deleted", { customer: "cus_1" }, "evt_1");

    await handleStripeEvent(evt);
    expect(callsTo("organization.updateMany")).toHaveLength(1);

    // Zweite Zustellung desselben Events: darf nichts mehr schreiben.
    await handleStripeEvent(evt);
    expect(callsTo("organization.updateMany")).toHaveLength(1);
  });

  it("verarbeitet unterschiedliche Events beide", async () => {
    await handleStripeEvent(event("customer.subscription.deleted", { customer: "cus_1" }, "evt_1"));
    await handleStripeEvent(event("customer.subscription.deleted", { customer: "cus_2" }, "evt_2"));
    expect(callsTo("organization.updateMany")).toHaveLength(2);
  });

  it("lässt Events ohne ID durch (Stub-Provider in Dev/Test)", async () => {
    await handleStripeEvent(event("customer.subscription.deleted", { customer: "cus_1" }));
    await handleStripeEvent(event("customer.subscription.deleted", { customer: "cus_1" }));
    expect(callsTo("organization.updateMany")).toHaveLength(2);
  });

  it("gibt die Reservierung frei, wenn die Verarbeitung scheitert", async () => {
    // Sonst bliebe die Marke stehen und Stripes Wiederholung würde als
    // vermeintliches Duplikat verworfen -> das Event wäre still verloren.
    const evt = event("customer.subscription.deleted", { customer: "cus_1" }, "evt_1");
    prismaMock.organization.updateMany.mockRejectedValueOnce(new Error("DB weg"));

    await expect(handleStripeEvent(evt)).rejects.toThrow("DB weg");
    expect(callsTo("billingWebhookEvent.delete")[0].where).toMatchObject({ id: "evt_1" });

    // Die Wiederholung muss wieder greifen.
    await handleStripeEvent(evt);
    expect(callsTo("organization.updateMany")).toHaveLength(1);
  });
});

describe("handleStripeEvent – Zahlung fehlgeschlagen (Karenzzeit startet)", () => {
  it("setzt PAST_DUE und startet das Karenzzeit-Fenster", async () => {
    await handleStripeEvent(
      event("invoice.payment_failed", { customer: "cus_1", id: "in_1", status: "open" }, "evt_1"),
    );

    const updates = callsTo("organization.updateMany");
    // 1. Fenster öffnen (nur wenn leer), 2. Status setzen.
    const openWindow = updates.find(
      (u) => (u.data as Record<string, unknown>).pastDueSince instanceof Date,
    );
    expect(openWindow).toBeDefined();
    expect(openWindow!.where).toMatchObject({ stripeCustomerId: "cus_1", pastDueSince: null });

    const statusUpdate = updates.find(
      (u) => (u.data as Record<string, unknown>).subscriptionStatus === "PAST_DUE",
    );
    expect(statusUpdate).toBeDefined();
  });

  it("startet die Karenzzeit bei Stripe-Retries NICHT neu", async () => {
    // Der Filter `pastDueSince: null` ist genau der Schutz: ein zweiter
    // Fehlversuch trifft die Zeile nicht mehr, das Fenster bleibt beim ersten.
    await handleStripeEvent(
      event("invoice.payment_failed", { customer: "cus_1", id: "in_1", status: "open" }, "evt_1"),
    );
    await handleStripeEvent(
      event("invoice.payment_failed", { customer: "cus_1", id: "in_1", status: "open" }, "evt_2"),
    );

    const windowWrites = callsTo("organization.updateMany").filter(
      (u) => (u.data as Record<string, unknown>).pastDueSince instanceof Date,
    );
    expect(windowWrites).toHaveLength(2);
    for (const w of windowWrites) {
      expect(w.where).toMatchObject({ pastDueSince: null });
    }
  });

  it("spiegelt die fehlgeschlagene Rechnung in die Historie", async () => {
    await handleStripeEvent(
      event(
        "invoice.payment_failed",
        {
          customer: "cus_1",
          id: "in_1",
          status: "open",
          number: "R-2026-001",
          amount_due: 4900,
          amount_paid: 0,
          currency: "eur",
          created: 1_782_000_000,
          hosted_invoice_url: "https://stripe/i/1",
          invoice_pdf: "https://stripe/i/1.pdf",
        },
        "evt_1",
      ),
    );

    const [upsert] = callsTo("invoice.upsert");
    expect(upsert.where).toMatchObject({ stripeInvoiceId: "in_1" });
    expect(upsert.create).toMatchObject({
      organizationId: "org-1",
      status: "FAILED",
      amountDue: 4900,
      amountPaid: 0,
      currency: "eur",
      number: "R-2026-001",
    });
    // Stripe liefert Unix-Sekunden -> ms.
    expect((upsert.create as { issuedAt: Date }).issuedAt.toISOString()).toBe(
      new Date(1_782_000_000 * 1000).toISOString(),
    );
  });

  it("ignoriert Rechnungen unbekannter Customer (kein Tenant-Treffer)", async () => {
    organizationForCustomer = null;
    await handleStripeEvent(
      event("invoice.payment_failed", { customer: "cus_unbekannt", id: "in_1", status: "open" }, "evt_1"),
    );
    expect(callsTo("invoice.upsert")).toHaveLength(0);
  });
});

describe("handleStripeEvent – Zahlung erfolgreich (Karenzzeit endet)", () => {
  it("reaktiviert und schließt das Karenzzeit-Fenster", async () => {
    await handleStripeEvent(
      event("invoice.paid", { customer: "cus_1", id: "in_2", status: "paid" }, "evt_1"),
    );

    const [update] = callsTo("organization.updateMany");
    expect(update.where).toMatchObject({ stripeCustomerId: "cus_1" });
    expect(update.data).toMatchObject({ subscriptionStatus: "ACTIVE", pastDueSince: null });
  });

  it("spiegelt die bezahlte Rechnung", async () => {
    await handleStripeEvent(
      event(
        "invoice.paid",
        { customer: "cus_1", id: "in_2", status: "paid", amount_due: 4900, amount_paid: 4900 },
        "evt_1",
      ),
    );
    expect(callsTo("invoice.upsert")[0].create).toMatchObject({
      status: "PAID",
      amountPaid: 4900,
    });
  });
});

describe("handleStripeEvent – Kündigung", () => {
  it("setzt CANCELED und schließt das Fenster", async () => {
    await handleStripeEvent(event("customer.subscription.deleted", { customer: "cus_1" }, "evt_1"));
    expect(callsTo("organization.updateMany")[0].data).toMatchObject({
      subscriptionStatus: "CANCELED",
      pastDueSince: null,
    });
  });
});

describe("handleStripeEvent – Checkout abgeschlossen", () => {
  it("setzt Plan, Limits, Stripe-IDs und aktiviert den Tenant", async () => {
    await handleStripeEvent(
      event(
        "checkout.session.completed",
        {
          customer: "cus_1",
          subscription: "sub_1",
          metadata: { organizationId: "org-1", plan: "PRO" },
        },
        "evt_1",
      ),
    );

    const [update] = callsTo("organization.update");
    expect(update.where).toMatchObject({ id: "org-1" });
    expect(update.data).toMatchObject({
      subscriptionStatus: "ACTIVE",
      subscriptionPlan: "PRO",
      pastDueSince: null,
      stripeCustomerId: "cus_1",
      stripeSubscriptionId: "sub_1",
    });
    expect((update.data as { planLimits: unknown }).planLimits).toMatchObject({
      patients: 1000,
      caregivers: 100,
      vehicles: 30,
      ki: true,
    });
  });

  it("ignoriert einen Checkout ohne organizationId in den Metadaten", async () => {
    await handleStripeEvent(event("checkout.session.completed", { customer: "cus_1" }, "evt_1"));
    expect(callsTo("organization.update")).toHaveLength(0);
  });

  it("ignoriert einen unbekannten Plan, aktiviert aber trotzdem", async () => {
    await handleStripeEvent(
      event(
        "checkout.session.completed",
        { customer: "cus_1", metadata: { organizationId: "org-1", plan: "GOLD" } },
        "evt_1",
      ),
    );
    const [update] = callsTo("organization.update");
    expect(update.data).toMatchObject({ subscriptionStatus: "ACTIVE" });
    expect(update.data).not.toHaveProperty("subscriptionPlan");
  });
});

describe("handleStripeEvent – Subscription-Lebenszyklus", () => {
  it("suspendiert bei `unpaid` (Stripe-Retries erschöpft)", async () => {
    await handleStripeEvent(
      event("customer.subscription.updated", { customer: "cus_1", id: "sub_1", status: "unpaid" }, "evt_1"),
    );
    expect(callsTo("organization.updateMany")[0].data).toMatchObject({
      subscriptionStatus: "SUSPENDED",
      pastDueSince: null,
    });
  });

  it("ignoriert Zwischenzustände wie `incomplete`", async () => {
    await handleStripeEvent(
      event("customer.subscription.updated", { customer: "cus_1", id: "sub_1", status: "incomplete" }, "evt_1"),
    );
    expect(callsTo("organization.updateMany")).toHaveLength(0);
  });

  it("ignoriert unbekannte Event-Typen", async () => {
    await handleStripeEvent(event("customer.discount.created", { customer: "cus_1" }, "evt_1"));
    expect(callsTo("organization.updateMany")).toHaveLength(0);
    expect(callsTo("organization.update")).toHaveLength(0);
  });
});
