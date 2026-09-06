import { describe, it, expect } from "vitest";
import type { Caregiver } from "@len-len/api-client";
import { qualificationShares } from "../src/components/overview/qualifications-card";

/**
 * Zusammensetzung des Teams nach Qualifikationsstufe.
 *
 * Reine Rechnung, aber sie steht als Prozentwert auf dem Startbildschirm --
 * und ein Prozentwert wird geglaubt. Der heikle Teil ist nicht die Division,
 * sondern WER mitgezaehlt wird.
 */

function caregiver(over: Partial<Caregiver> & { id: string }): Caregiver {
  return {
    firstName: "Test",
    lastName: "Person",
    qualification: "PFLEGEFACHKRAFT",
    contractType: "FULL_100",
    weeklyHours: "39",
    workDays: ["MON"],
    maxPatients: 10,
    isActive: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    ...over,
  };
}

describe("qualificationShares", () => {
  it("rechnet die Anteile ueber die aktiven Fachkraefte", () => {
    const shares = qualificationShares([
      caregiver({ id: "a", qualification: "PFLEGEFACHKRAFT" }),
      caregiver({ id: "b", qualification: "PFLEGEFACHKRAFT" }),
      caregiver({ id: "c", qualification: "PFLEGEHILFSKRAFT" }),
      caregiver({ id: "d", qualification: "BETREUUNGSKRAFT" }),
    ]);

    expect(shares.find((s) => s.qualification === "PFLEGEFACHKRAFT")).toMatchObject({
      count: 2,
      percent: 50,
    });
    expect(shares.find((s) => s.qualification === "AUSZUBILDENDE")).toMatchObject({
      count: 0,
      percent: 0,
    });
  });

  it("laesst ausgeschiedene Fachkraefte aussen vor", () => {
    // Die Karte beantwortet "wer kann heute fahren". Eine ausgeschiedene
    // Fachkraft mitzuzaehlen liesse das Team groesser und die Verteilung
    // guenstiger aussehen, als sie ist.
    const shares = qualificationShares([
      caregiver({ id: "a", qualification: "PFLEGEFACHKRAFT" }),
      caregiver({ id: "b", qualification: "PFLEGEHILFSKRAFT", isActive: false }),
    ]);

    expect(shares.find((s) => s.qualification === "PFLEGEFACHKRAFT")?.percent).toBe(100);
    expect(shares.find((s) => s.qualification === "PFLEGEHILFSKRAFT")?.count).toBe(0);
  });

  it("ergibt ohne aktive Fachkraft ueberall 0 und nie NaN", () => {
    // Eine Division durch null erzeugte sonst die Breite "NaN%", die der
    // Browser stillschweigend als 0 zeichnet -- ein Balken, der luegt, ohne
    // dass irgendetwas fehlschlaegt.
    const shares = qualificationShares([caregiver({ id: "a", isActive: false })]);

    expect(shares.every((s) => s.percent === 0 && s.count === 0)).toBe(true);
    expect(shares.every((s) => Number.isFinite(s.percent))).toBe(true);
  });

  it("nennt immer alle vier Stufen, auch die unbesetzten", () => {
    // Eine fehlende Stufe waere nicht als "keine" zu lesen, sondern als
    // "gibt es nicht" -- und die Karte soll gerade die Luecke zeigen.
    expect(qualificationShares([]).map((s) => s.qualification)).toEqual([
      "PFLEGEFACHKRAFT",
      "PFLEGEHILFSKRAFT",
      "BETREUUNGSKRAFT",
      "AUSZUBILDENDE",
    ]);
  });
});
