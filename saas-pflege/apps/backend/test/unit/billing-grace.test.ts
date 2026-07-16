import { describe, it, expect } from "vitest";
import { graceCutoff, graceDeadline, graceDaysRemaining } from "../../src/modules/billing/grace.js";
import { mapInvoiceStatus } from "../../src/modules/billing/events.js";

// Fixer Bezugspunkt: die Karenzzeit rechnet in echten Tagen, die Tests dürfen
// nicht von der Laufzeit-Uhr abhängen.
const FAILED_AT = new Date("2026-07-01T12:00:00.000Z");
const at = (iso: string): Date => new Date(iso);

describe("graceDeadline (Karenzzeit, Regel 8)", () => {
  it("addiert die Karenztage auf den ersten Fehlversuch", () => {
    expect(graceDeadline(FAILED_AT, 7).toISOString()).toBe("2026-07-08T12:00:00.000Z");
    expect(graceDeadline(FAILED_AT, 14).toISOString()).toBe("2026-07-15T12:00:00.000Z");
  });

  it("bei 0 Tagen ist die Frist der Fehlversuch selbst (sofortige Suspendierung)", () => {
    expect(graceDeadline(FAILED_AT, 0).toISOString()).toBe(FAILED_AT.toISOString());
  });
});

/**
 * graceCutoff treibt die tatsächliche Suspendierung (WHERE pastDueSince <=
 * cutoff), deshalb wird hier der Cutoff geprüft und nicht ein nur fürs Lesen
 * gebauter Hilfsprädikat.
 */
describe("graceCutoff (Kipppunkt des Suspendierungs-Laufs)", () => {
  // `pastDueSince <= cutoff` muss äquivalent zu `now >= deadline` sein.
  const expired = (now: string, graceDays = 7): boolean =>
    FAILED_AT.getTime() <= graceCutoff(at(now), graceDays).getTime();

  it("trifft NICHT, solange die Frist in der Zukunft liegt", () => {
    expect(expired("2026-07-01T12:00:01.000Z")).toBe(false);
    expect(expired("2026-07-08T11:59:59.000Z")).toBe(false);
  });

  it("trifft exakt auf der Frist (Grenzfall)", () => {
    expect(expired("2026-07-08T12:00:00.000Z")).toBe(true);
  });

  it("trifft danach", () => {
    expect(expired("2026-07-09T00:00:00.000Z")).toBe(true);
  });

  it("suspendiert bei Karenzzeit 0 sofort", () => {
    expect(expired("2026-07-01T12:00:00.000Z", 0)).toBe(true);
  });

  it("ist die exakte Umkehrung von graceDeadline", () => {
    for (const days of [0, 1, 7, 14, 30]) {
      const viaCutoff = graceCutoff(at("2026-07-20T12:00:00.000Z"), days).getTime();
      // pastDueSince == cutoff  <=>  deadline == now
      expect(graceDeadline(new Date(viaCutoff), days).toISOString()).toBe(
        "2026-07-20T12:00:00.000Z",
      );
    }
  });
});

describe("graceDaysRemaining (Anzeige)", () => {
  it("zählt angebrochene Tage auf", () => {
    expect(graceDaysRemaining(FAILED_AT, at("2026-07-01T12:00:00.000Z"), 7)).toBe(7);
    expect(graceDaysRemaining(FAILED_AT, at("2026-07-02T00:00:00.000Z"), 7)).toBe(7);
    expect(graceDaysRemaining(FAILED_AT, at("2026-07-07T12:00:00.000Z"), 7)).toBe(1);
  });

  it("liefert 0 statt negativer Tage, sobald die Frist durch ist", () => {
    expect(graceDaysRemaining(FAILED_AT, at("2026-07-08T12:00:00.000Z"), 7)).toBe(0);
    expect(graceDaysRemaining(FAILED_AT, at("2026-08-01T00:00:00.000Z"), 7)).toBe(0);
  });
});

describe("mapInvoiceStatus", () => {
  it("der Event-Typ schlägt den Objekt-Status", () => {
    // payment_failed lässt die Stripe-Rechnung selbst auf `open` stehen – nur
    // der Event verrät den Fehlschlag.
    expect(mapInvoiceStatus("invoice.payment_failed", "open")).toBe("FAILED");
    expect(mapInvoiceStatus("invoice.paid", "open")).toBe("PAID");
    expect(mapInvoiceStatus("invoice.payment_succeeded", "paid")).toBe("PAID");
    expect(mapInvoiceStatus("invoice.voided", "void")).toBe("VOID");
  });

  it("fällt bei Lebenszyklus-Events auf den Objekt-Status zurück", () => {
    expect(mapInvoiceStatus("invoice.created", "draft")).toBe("OPEN");
    expect(mapInvoiceStatus("invoice.finalized", "open")).toBe("OPEN");
    expect(mapInvoiceStatus("invoice.updated", "uncollectible")).toBe("FAILED");
    expect(mapInvoiceStatus("invoice.updated", "paid")).toBe("PAID");
  });

  it("ignoriert Nicht-Rechnungs-Events und unbekannte Objekt-Status", () => {
    expect(mapInvoiceStatus("customer.subscription.updated", "active")).toBeNull();
    expect(mapInvoiceStatus("checkout.session.completed")).toBeNull();
    expect(mapInvoiceStatus("invoice.updated", undefined)).toBeNull();
    expect(mapInvoiceStatus("invoice.updated", "egal")).toBeNull();
  });
});
