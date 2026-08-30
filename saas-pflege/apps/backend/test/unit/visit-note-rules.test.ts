import { describe, it, expect } from "vitest";
import { checkVisitNote, NOTE_EDIT_WINDOW_MS } from "../../src/modules/visits/visit.rules.js";

/**
 * Regeln der Besuchsnotiz.
 *
 * Eine Notiz ist Teil der Pflegedokumentation: sie darf nicht über einen
 * Besuch geschrieben werden, der nie stattgefunden hat, ein gemeldeter Vorfall
 * darf nicht inhaltslos sein, und was einmal steht, wird nicht Tage später
 * umgeschrieben.
 */

const ARRIVAL = new Date("2026-08-30T09:00:00.000Z");
const DEPARTURE = new Date("2026-08-30T09:40:00.000Z");
const TEXT = { note: "Patientin wirkte müde, Verband gewechselt.", hasIncident: false };

/** Besuch, der begonnen und beendet ist, ohne Notiz. */
function visit(over: Partial<Parameters<typeof checkVisitNote>[0]> = {}) {
  return {
    gpsArrivalAt: ARRIVAL,
    gpsDepartureAt: DEPARTURE,
    visitNote: null,
    ...over,
  };
}

describe("checkVisitNote", () => {
  it("accepte une première note sur un besuch commencé", () => {
    expect(checkVisitNote(visit(), TEXT, DEPARTURE)).toBeNull();
  });

  it("refuse tant que le besuch n'a pas commencé", () => {
    // Sans pointage d'arrivée, personne n'était chez le patient. Une note
    // serait une invention.
    expect(checkVisitNote(visit({ gpsArrivalAt: null }), TEXT, DEPARTURE)).toBe("not_started");
  });

  it("accepte pendant le besuch, avant le pointage de départ", () => {
    // Arrivée faite, départ pas encore : la Fachkraft écrit au chevet plutôt
    // qu'en repartant. Rien ne justifie de l'en empêcher.
    const during = visit({ gpsDepartureAt: null });
    expect(checkVisitNote(during, TEXT, new Date("2026-08-30T09:20:00.000Z"))).toBeNull();
  });

  it("exige un texte quand un incident est signalé", () => {
    const incident = { note: "   ", hasIncident: true };
    expect(checkVisitNote(visit(), incident, DEPARTURE)).toBe("incident_without_note");
  });

  it("refuse une note vide même sans incident", () => {
    expect(checkVisitNote(visit(), { note: "  ", hasIncident: false }, DEPARTURE)).toBe("empty_note");
  });

  it("autorise la modification dans les deux heures suivant le départ", () => {
    const written = visit({ visitNote: "Erste Fassung" });
    const justInside = new Date(DEPARTURE.getTime() + NOTE_EDIT_WINDOW_MS - 1000);

    expect(checkVisitNote(written, TEXT, justInside)).toBeNull();
  });

  it("refuse la modification passé les deux heures", () => {
    const written = visit({ visitNote: "Erste Fassung" });
    const tooLate = new Date(DEPARTURE.getTime() + NOTE_EDIT_WINDOW_MS + 1000);

    expect(checkVisitNote(written, TEXT, tooLate)).toBe("edit_window_expired");
  });

  it("ne fait pas courir la fenêtre tant que le besuch n'est pas terminé", () => {
    // Pas de pointage de départ : rien n'est clos, donc rien n'expire. Sinon
    // une visite longue verrouillerait sa propre note.
    const written = visit({ visitNote: "Erste Fassung", gpsDepartureAt: null });
    const muchLater = new Date(ARRIVAL.getTime() + 8 * 60 * 60 * 1000);

    expect(checkVisitNote(written, TEXT, muchLater)).toBeNull();
  });

  it("laisse écrire une PREMIÈRE note même longtemps après le départ", () => {
    // La fenêtre encadre la RÉÉCRITURE. Une Fachkraft qui n'a rien écrit sur
    // le moment doit pouvoir le faire en fin de journée — sinon l'observation
    // est perdue, ce qui est pire qu'une note tardive.
    const late = new Date(DEPARTURE.getTime() + 6 * 60 * 60 * 1000);

    expect(checkVisitNote(visit(), TEXT, late)).toBeNull();
  });

  it("vérifie l'ordre des règles : besuch non commencé prime sur incident vide", () => {
    const notStarted = visit({ gpsArrivalAt: null });
    expect(checkVisitNote(notStarted, { note: "", hasIncident: true }, DEPARTURE)).toBe(
      "not_started",
    );
  });
});
