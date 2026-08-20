import { describe, it, expect } from "vitest";
import { SubscriptionStatus } from "@len-len/database";
import {
  csvCell,
  daysAgo,
  fillStatusCounts,
  toCsv,
  trialAlertWindow,
} from "../../src/modules/admin/admin.rules.js";
import { monthlyAmount } from "../../src/lib/billing/stripe.js";

const NOW = new Date("2026-08-20T12:00:00.000Z");

describe("trialAlertWindow", () => {
  it("couvre les 48 heures à venir", () => {
    const { from, to } = trialAlertWindow(NOW);
    expect(from.toISOString()).toBe("2026-08-20T12:00:00.000Z");
    expect(to.toISOString()).toBe("2026-08-22T12:00:00.000Z");
  });

  it("ne remonte pas dans le passé", () => {
    // Une période d'essai déjà expirée n'est plus un préavis : c'est le
    // travail du billing-worker. Les mélanger produirait une liste qui ne
    // raccourcit jamais.
    const { from } = trialAlertWindow(NOW);
    expect(from.getTime()).toBe(NOW.getTime());
  });
});

describe("daysAgo", () => {
  it("recule du nombre de jours demandé", () => {
    expect(daysAgo(NOW, 7).toISOString()).toBe("2026-08-13T12:00:00.000Z");
    expect(daysAgo(NOW, 30).toISOString()).toBe("2026-07-21T12:00:00.000Z");
  });

  it("ne modifie pas la date reçue", () => {
    const now = new Date(NOW);
    daysAgo(now, 7);
    expect(now.toISOString()).toBe(NOW.toISOString());
  });
});

describe("fillStatusCounts", () => {
  it("complète à zéro les statuts absents du GROUP BY", () => {
    // Le point du correctif : un statut sans tenant ne sort pas d'un GROUP BY
    // et disparaîtrait de l'affichage au lieu d'y figurer à 0.
    const counts = fillStatusCounts([
      { status: SubscriptionStatus.ACTIVE, count: 3 },
      { status: SubscriptionStatus.TRIAL, count: 1 },
    ]);

    expect(counts.ACTIVE).toBe(3);
    expect(counts.TRIAL).toBe(1);
    expect(counts.SUSPENDED).toBe(0);
    expect(counts.PAST_DUE).toBe(0);
    expect(counts.CANCELED).toBe(0);
  });

  it("couvre tous les statuts du modèle", () => {
    const counts = fillStatusCounts([]);
    for (const status of Object.values(SubscriptionStatus)) {
      expect(counts[status], status).toBe(0);
    }
  });
});

describe("csvCell", () => {
  it("neutralise les cellules interprétées comme formules", () => {
    // L'audit log contient des valeurs écrites par des utilisateurs. Une
    // cellule =HYPERLINK(...) s'exécute à l'ouverture dans Excel, et le
    // fichier vient du panel : personne ne s'en méfie.
    expect(csvCell("=1+1")).toBe('"\'=1+1"');
    expect(csvCell("+cmd")).toBe('"\'+cmd"');
    expect(csvCell("-2")).toBe('"\'-2"');
    expect(csvCell("@SUM(A1)")).toBe('"\'@SUM(A1)"');
  });

  it("double les guillemets (RFC 4180)", () => {
    expect(csvCell('il a dit "non"')).toBe('"il a dit ""non"""');
  });

  it("sérialise les objets et vide les valeurs absentes", () => {
    expect(csvCell({ a: 1 })).toBe('"{""a"":1}"');
    expect(csvCell(null)).toBe("");
    expect(csvCell(undefined)).toBe("");
  });

  it("laisse un texte ordinaire intact", () => {
    expect(csvCell("Müller")).toBe('"Müller"');
  });
});

describe("toCsv", () => {
  it("écrit l'en-tête, les lignes et un BOM", () => {
    const csv = toCsv(["a", "b"], [["1", "2"]]);
    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv).toContain('"a","b"\r\n"1","2"');
  });
});

describe("monthlyAmount", () => {
  it("laisse un prix mensuel tel quel", () => {
    expect(monthlyAmount(4900, { interval: "month" })).toBe(4900);
  });

  it("ramène un prix annuel au mois", () => {
    expect(monthlyAmount(12000, { interval: "year" })).toBe(1000);
  });

  it("tient compte de l'intervalle multiple", () => {
    // Facturé 6000 tous les 3 mois = 2000 par mois.
    expect(monthlyAmount(6000, { interval: "month", interval_count: 3 })).toBe(2000);
  });

  it("ignore un intervalle inconnu plutôt que d'inventer", () => {
    expect(monthlyAmount(4900, { interval: "decade" })).toBe(0);
  });
});
