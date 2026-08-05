import { describe, it, expect } from "vitest";
import { missingPriceEnvVars, planForPrice, priceForPlan } from "../../src/lib/billing/prices.js";

/**
 * Der Rückweg Preis -> Plan trägt den Planwechsel über das Stripe-Kundenportal:
 * dort ändert Stripe den Preis am Abo, die beim Checkout gesetzten Metadaten
 * bleiben aber auf dem alten Plan stehen. Würde der Webhook den Plan von dort
 * lesen, schriebe er nach jedem Portal-Wechsel den alten Plan zurück.
 *
 * Preise stammen aus vitest.config.ts (BASIC und PRO gesetzt, ENTERPRISE nicht).
 */
describe("planForPrice", () => {
  it("findet den Plan zum konfigurierten Preis", () => {
    expect(planForPrice("price_test_basic")).toBe("BASIC");
    expect(planForPrice("price_test_pro")).toBe("PRO");
  });

  it("ist der exakte Rückweg von priceForPlan", () => {
    const price = priceForPlan("PRO");
    expect(price).toBeDefined();
    expect(planForPrice(price as string)).toBe("PRO");
  });

  it("liefert null für einen unbekannten Preis", () => {
    // Ein von Hand in Stripe angelegter Sonderpreis darf keinen Plan erraten
    // lassen – der Webhook lässt den Plan dann lieber unverändert.
    expect(planForPrice("price_sonderdeal")).toBeNull();
  });

  it("liefert null statt eines Treffers auf einen nicht konfigurierten Plan", () => {
    // ENTERPRISE hat keinen Preis. Ein undefined-Eintrag darf nicht auf einen
    // leeren/undefinierten Preis "passen".
    expect(priceForPlan("ENTERPRISE")).toBeUndefined();
    expect(planForPrice("")).toBeNull();
  });
});

describe("missingPriceEnvVars", () => {
  it("nennt genau die Variablen, die zu setzen sind", () => {
    // Die Meldung soll ohne Nachdenken umsetzbar sein: der Variablenname, nicht
    // der Plan. In der Testkonfiguration fehlt nur ENTERPRISE.
    expect(missingPriceEnvVars()).toEqual(["STRIPE_PRICE_ENTERPRISE"]);
  });
});
