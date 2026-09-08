import { describe, it, expect } from "vitest";
import type { RouteRow } from "@len-len/api-client";
import { dayIssueCount, tourFlags } from "../src/components/overview/tours-card";

/**
 * Was die Übersicht aus der Machbarkeitsprüfung einer Tour liest.
 *
 * Reine Auswertung, aber sie entscheidet, ob auf dem Startbildschirm ein
 * Alarm steht. Beide Fehlerrichtungen kosten:
 *
 *   ein FEHLENDER Hinweis kostet einen Besuch,
 *   ein FALSCHER Alarm kostet die Glaubwürdigkeit aller weiteren – und die
 *   ist teurer, weil danach auch der richtige Hinweis übersehen wird.
 */

function route(over: Partial<RouteRow> = {}): RouteRow {
  return {
    id: "r-1",
    date: "2026-09-08",
    caregiver: { id: "c-1", firstName: "Nadia", lastName: "Reinhardt" },
    vehicleId: null,
    optimized: true,
    vrptwScore: 88,
    totalKm: 24.5,
    visitCount: 9,
    feasible: true,
    violationCount: 0,
    uncheckedVisits: 0,
    staffingIssueCount: 0,
    ...over,
  };
}

describe("tourFlags", () => {
  it("meldet eine Tour, die zeitlich nicht aufgeht", () => {
    expect(tourFlags(route({ feasible: false, violationCount: 2 }))).toEqual({
      infeasible: true,
      violationCount: 2,
      uncheckedVisits: 0,
      staffingIssues: 0,
      alert: "time",
    });
  });

  it("lässt die Besetzung die Zeit ausstechen", () => {
    // Nicht nach Anzahl, sondern nach Art: eine Tour, die jemand nicht fahren
    // DARF, wird nicht dadurch zulaessig, dass man sie umsortiert. Die
    // Verspaetung ist dann nicht die Entscheidung, die ansteht.
    const flags = tourFlags(route({ feasible: false, violationCount: 9, staffingIssueCount: 1 }));

    expect(flags.alert).toBe("staffing");
    // Die Zeit bleibt lesbar, sie tritt nur nicht in die Pastille.
    expect(flags.infeasible).toBe(true);
    expect(flags.violationCount).toBe(9);
  });

  it("meldet die Besetzung auch bei einwandfreier Zeitplanung", () => {
    expect(tourFlags(route({ staffingIssueCount: 2 })).alert).toBe("staffing");
  });

  it("schweigt, wenn es nichts zu melden gibt", () => {
    expect(tourFlags(route({ uncheckedVisits: 4 })).alert).toBeNull();
  });

  it("schweigt, wenn die Antwort das Feld gar nicht enthält", () => {
    // Waehrend einer Auslieferung antwortet die alte Fassung des Backends
    // ohne die Pruefung. `!route.feasible` waere hier `true` und wuerde jede
    // Tour des Tages als kaputt melden.
    const withoutCheck = { ...route() } as Partial<RouteRow>;
    delete withoutCheck.feasible;
    delete withoutCheck.violationCount;
    delete withoutCheck.uncheckedVisits;
    delete withoutCheck.staffingIssueCount;

    expect(tourFlags(withoutCheck as RouteRow)).toEqual({
      infeasible: false,
      violationCount: 0,
      uncheckedVisits: 0,
      staffingIssues: 0,
      alert: null,
    });
  });

  it("trennt ungeprüft von nicht fahrbar", () => {
    // Eine Tour ohne Koordinaten ist nicht "in Ordnung", sondern unbekannt.
    // Sie darf trotzdem nicht als Verstoss gezaehlt werden -- geprueft wurde
    // sie ja gerade nicht.
    const flags = tourFlags(route({ feasible: true, uncheckedVisits: 3 }));

    expect(flags.infeasible).toBe(false);
    expect(flags.uncheckedVisits).toBe(3);
  });

  it("nimmt keine negativen Zahlen an", () => {
    const flags = tourFlags(route({ violationCount: -1, uncheckedVisits: -4 }));

    expect(flags.violationCount).toBe(0);
    expect(flags.uncheckedVisits).toBe(0);
  });
});

describe("dayIssueCount", () => {
  it("zählt auch die Touren, die niemand fahren darf", () => {
    // Sonst stuende im Untertitel eine kleinere Zahl als in der Liste, und die
    // Karte widerspraeche sich selbst.
    expect(
      dayIssueCount([
        route({ id: "a", staffingIssueCount: 1 }),
        route({ id: "b", feasible: false, violationCount: 1 }),
        route({ id: "c" }),
      ]),
    ).toBe(2);
  });

  it("zählt die Touren, nicht die Verstösse", () => {
    // Der Untertitel beantwortet "wie viele Touren muss ich anfassen", nicht
    // "wie viele Anschluesse sind zu spaet". Eine Tour mit fuenf Verstoessen
    // bleibt eine Tour.
    expect(
      dayIssueCount([
        route({ id: "a", feasible: false, violationCount: 5 }),
        route({ id: "b", feasible: false, violationCount: 1 }),
        route({ id: "c" }),
      ]),
    ).toBe(2);
  });

  it("ist null, wenn der Tag aufgeht", () => {
    expect(dayIssueCount([route({ id: "a" }), route({ id: "b", uncheckedVisits: 2 })])).toBe(0);
  });
});
