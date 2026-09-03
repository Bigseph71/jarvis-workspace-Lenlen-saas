import { describe, it, expect } from "vitest";
import type { MyVisit } from "@len-len/api-client";
import { currentVisit, driftMinutes, remainingCount } from "../src/lib/tour";

/**
 * Logik der Tagesansicht.
 *
 * Diese drei Funktionen entscheiden, WAS die Fachkraft im Treppenhaus zuerst
 * sieht. Ein Fehler darin ist auf dem Telefon schwer zu bemerken und teuer:
 * die grosse Karte zeigt dann den falschen Patienten.
 */

function visit(over: Partial<MyVisit> = {}): MyVisit {
  return {
    id: "v-1",
    patientId: "p-1",
    scheduledAt: "2026-09-03T08:00:00.000Z",
    status: "PLANNED",
    isEmergency: false,
    emergencyReason: null,
    gpsArrivalAt: null,
    gpsDepartureAt: null,
    visitNote: null,
    hasIncident: false,
    visitNoteWrittenAt: null,
    patient: {
      id: "p-1",
      firstName: "Ingrid",
      lastName: "Vogel",
      rawAddress: "Tilsiter Str. 12",
      normalizedAddress: null,
      latitude: null,
      longitude: null,
      geocodingStatus: "VALID",
    },
    ...over,
  };
}

describe("currentVisit", () => {
  it("bevorzugt den LAUFENDEN Besuch, auch wenn ein früherer noch geplant ist", () => {
    // Wer schon beim Patienten ist, darf keine Karte sehen, die ihn woanders
    // hinschickt – auch dann nicht, wenn ein früher terminierter Besuch noch
    // offen aussieht.
    const running = visit({ id: "v-running", status: "IN_PROGRESS", scheduledAt: "2026-09-03T10:00:00.000Z" });
    const earlier = visit({ id: "v-earlier", scheduledAt: "2026-09-03T08:00:00.000Z" });

    expect(currentVisit([earlier, running])?.id).toBe("v-running");
  });

  it("nimmt sonst den ersten geplanten in Listenreihenfolge", () => {
    const first = visit({ id: "v-1" });
    const second = visit({ id: "v-2", scheduledAt: "2026-09-03T09:00:00.000Z" });

    expect(currentVisit([first, second])?.id).toBe("v-1");
  });

  it("überspringt Erledigtes", () => {
    const done = visit({ id: "v-done", status: "COMPLETED" });
    const open = visit({ id: "v-open" });

    expect(currentVisit([done, open])?.id).toBe("v-open");
  });

  it("gibt null zurück, wenn der Tag durch ist", () => {
    // Dann verschwindet die grosse Karte, statt einen erledigten Besuch als
    // "nächsten" auszugeben.
    expect(currentVisit([visit({ status: "COMPLETED" })])).toBeNull();
    expect(currentVisit([])).toBeNull();
  });
});

describe("driftMinutes", () => {
  it("meldet die Verspätung in ganzen Minuten", () => {
    expect(
      driftMinutes({
        scheduledAt: "2026-09-03T08:00:00.000Z",
        gpsArrivalAt: "2026-09-03T08:06:00.000Z",
      }),
    ).toBe(6);
  });

  it("meldet eine frühe Ankunft NEGATIV", () => {
    // Die Anzeige darf sie deshalb nicht wie eine Verspätung einfärben.
    expect(
      driftMinutes({
        scheduledAt: "2026-09-03T08:00:00.000Z",
        gpsArrivalAt: "2026-09-03T07:52:00.000Z",
      }),
    ).toBe(-8);
  });

  it("gibt null vor der Ankunft zurück", () => {
    // Eine "0 Min." wäre eine Behauptung über etwas, das noch nicht
    // stattgefunden hat.
    expect(driftMinutes({ scheduledAt: "2026-09-03T08:00:00.000Z", gpsArrivalAt: null })).toBeNull();
  });

  it("gibt null bei einem unlesbaren Datum zurück, statt NaN anzuzeigen", () => {
    expect(driftMinutes({ scheduledAt: "kaputt", gpsArrivalAt: "2026-09-03T08:00:00.000Z" })).toBeNull();
  });
});

describe("remainingCount", () => {
  it("zählt weder Erledigtes noch Storniertes", () => {
    const visits = [
      visit({ id: "a", status: "COMPLETED" }),
      visit({ id: "b", status: "CANCELED" }),
      visit({ id: "c", status: "PLANNED" }),
      visit({ id: "d", status: "IN_PROGRESS" }),
    ];

    expect(remainingCount(visits)).toBe(2);
  });

  it("zählt einen verpassten Besuch MIT", () => {
    // Verpasst heisst nicht erledigt: er steht weiter aus und die Koordination
    // muss ihn sehen.
    expect(remainingCount([visit({ status: "MISSED" })])).toBe(1);
  });
});
