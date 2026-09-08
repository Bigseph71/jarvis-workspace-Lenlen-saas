import { describe, it, expect } from "vitest";
import {
  travelMinutes,
  visitDurationMinutes,
  checkTourFeasibility,
  AVERAGE_SPEED_KMH,
  DETOUR_FACTOR,
  DEFAULT_CARE_MINUTES,
  type TourStop,
} from "../../src/lib/vrptw/feasibility.js";

/**
 * Ist eine Tour fahrbar?
 *
 * Der Optimierer ordnete die Besuche nach Naehe und war fertig. Der einzige
 * zeitliche Schutz war ein Mindestabstand von 15 Minuten zwischen zwei
 * Besuchen -- ein Riegel gegen Doppelbuchung, kein Fahrplan. Fuenfzehn Minuten
 * reichen weder fuer eine Ganzkoerperpflege noch fuer die Fahrt danach, und
 * eine Tour aus solchen Terminen sieht auf dem Bildschirm tadellos aus.
 *
 * Was hier geprueft wird, ist deshalb die Rechnung, die vorher niemand
 * anstellte: Pflegezeit + Fahrzeit gegen den naechsten Termin.
 */

/** Heidelberg, zwei Punkte rund 2 km auseinander. */
const A = { lat: 49.4093, lng: 8.6939 };
const B = { lat: 49.4093, lng: 8.7215 };

function stop(over: Partial<TourStop> & { visitId: string; scheduledAt: string }): TourStop {
  return {
    patientName: "Ilse Vogel",
    durationMinutes: 30,
    lat: A.lat,
    lng: A.lng,
    ...over,
    scheduledAt: new Date(over.scheduledAt),
  };
}

describe("travelMinutes", () => {
  it("rechnet Luftlinie, Umweg und Geschwindigkeit zusammen", () => {
    // 2 km Luftlinie, Faktor 1,3 -> 2,6 km gefahren; bei 25 km/h rund 6,2 Min.
    const minutes = travelMinutes(A, B);

    expect(minutes).toBeGreaterThan(5);
    expect(minutes).toBeLessThan(9);
  });

  it("rundet AUF ganze Minuten", () => {
    // Abrunden liesse die Tour mit jeder Station optimistischer erscheinen.
    expect(Number.isInteger(travelMinutes(A, B))).toBe(true);
    expect(travelMinutes(A, { lat: 49.4094, lng: 8.6940 })).toBe(1);
  });

  it("ist null zwischen zwei identischen Punkten", () => {
    expect(travelMinutes(A, A)).toBe(0);
  });

  it("waechst mit der Entfernung", () => {
    const nah = travelMinutes(A, { lat: 49.4093, lng: 8.7 });
    const fern = travelMinutes(A, { lat: 49.4093, lng: 8.8 });

    expect(fern).toBeGreaterThan(nah);
  });

  it("beruecksichtigt den Umweg, statt die Luftlinie zu fahren", () => {
    // Ohne Umwegfaktor waere die Fahrzeit zu kurz -- und eine unfahrbare Tour
    // erschiene machbar. Der Schaden laege beim wartenden Patienten.
    const mitUmweg = travelMinutes(A, B);
    const ohneUmweg = travelMinutes(A, B, { detourFactor: 1 });

    expect(mitUmweg).toBeGreaterThan(ohneUmweg);
    expect(DETOUR_FACTOR).toBeGreaterThan(1);
  });

  it("laesst Geschwindigkeit und Umweg ueberschreiben", () => {
    // Der Aufrufer kann sie setzen; die Vorgaben sind nur Vorgaben. Ein echter
    // Routing-Dienst ersetzt spaeter genau diese Funktion.
    expect(travelMinutes(A, B, { speedKmh: AVERAGE_SPEED_KMH / 2 })).toBeGreaterThan(
      travelMinutes(A, B),
    );
  });
});

describe("visitDurationMinutes", () => {
  it("nimmt die Ausnahme des Besuchs, wenn sie gesetzt ist", () => {
    expect(visitDurationMinutes({ durationMinutes: 45, patient: { careMinutes: 30 } })).toBe(45);
  });

  it("nimmt sonst die uebliche Dauer des Patienten", () => {
    // Die Dauer haengt am Pflegebedarf, nicht am Tag.
    expect(visitDurationMinutes({ durationMinutes: null, patient: { careMinutes: 20 } })).toBe(20);
  });

  it("faellt auf die Vorgabe zurueck, wenn nichts hinterlegt ist", () => {
    // Die Spalten sind neu: ein Altbestand oder ein Import kann sie leer
    // lassen. Eine Dauer von 0 machte JEDE Tour machbar -- die Pruefung waere
    // da, aber wirkungslos.
    expect(visitDurationMinutes({})).toBe(DEFAULT_CARE_MINUTES);
    expect(visitDurationMinutes({ durationMinutes: 0, patient: { careMinutes: 0 } })).toBe(
      DEFAULT_CARE_MINUTES,
    );
  });
});

describe("checkTourFeasibility", () => {
  it("laesst eine Tour mit genug Luft durchgehen", () => {
    // 9:00 + 30 Min. Pflege + ~7 Min. Fahrt = 9:37. Der naechste Termin um
    // 10:00 ist bequem erreichbar.
    const report = checkTourFeasibility([
      stop({ visitId: "v-1", scheduledAt: "2026-09-08T09:00:00.000Z" }),
      stop({ visitId: "v-2", scheduledAt: "2026-09-08T10:00:00.000Z", ...B }),
    ]);

    expect(report.feasible).toBe(true);
    expect(report.violations).toHaveLength(0);
  });

  it("meldet die Tour, die frueher nur am Mindestabstand gemessen wurde", () => {
    // DER Fall, um den es geht. Zwei Termine 20 Minuten auseinander: der alte
    // 15-Minuten-Riegel liess sie durch. Mit 30 Minuten Pflege und 7 Minuten
    // Fahrt fehlen aber 17 Minuten.
    const report = checkTourFeasibility([
      stop({ visitId: "v-1", scheduledAt: "2026-09-08T09:00:00.000Z" }),
      stop({ visitId: "v-2", scheduledAt: "2026-09-08T09:20:00.000Z", ...B }),
    ]);

    expect(report.feasible).toBe(false);
    expect(report.violations).toHaveLength(1);
    expect(report.violations[0]!.lateByMinutes).toBeGreaterThan(15);
  });

  it("nennt zu jedem Verstoss BEIDE Besuche", () => {
    // "Frau Vogel wird 17 Minuten zu spaet erreicht" laesst offen, wo man
    // ansetzen muesste. Mit dem Vorgaenger ist die Entscheidung eine Frage
    // von Sekunden.
    const report = checkTourFeasibility([
      stop({ visitId: "v-1", scheduledAt: "2026-09-08T09:00:00.000Z" }),
      stop({
        visitId: "v-2",
        patientName: "Herr Schuster",
        scheduledAt: "2026-09-08T09:20:00.000Z",
        ...B,
      }),
    ]);

    const violation = report.violations[0]!;
    expect(violation.visitId).toBe("v-2");
    expect(violation.patientName).toBe("Herr Schuster");
    expect(violation.previousVisitId).toBe("v-1");
    expect(violation.previousDurationMinutes).toBe(30);
    expect(violation.travelMinutes).toBeGreaterThan(0);
  });

  it("laesst die Verspaetung sich NICHT fortpflanzen", () => {
    // Gerechnet wird ab dem geplanten Termin des Vorgaengers, nicht ab seiner
    // verspaeteten Ankunft. Sonst zoege ein einziger enger Uebergang am Morgen
    // eine Kette durch den ganzen Tag, und die Koordination saehe zwanzig
    // Meldungen fuer ein Problem.
    const report = checkTourFeasibility([
      stop({ visitId: "v-1", scheduledAt: "2026-09-08T09:00:00.000Z" }),
      // Zu eng: erzeugt einen Verstoss.
      stop({ visitId: "v-2", scheduledAt: "2026-09-08T09:20:00.000Z", ...B }),
      // Danach wieder viel Luft: darf NICHT mitgerissen werden.
      stop({ visitId: "v-3", scheduledAt: "2026-09-08T11:00:00.000Z", ...B }),
    ]);

    expect(report.violations.map((v) => v.visitId)).toEqual(["v-2"]);
  });

  it("zaehlt Pflege- und Fahrzeit der ganzen Tour", () => {
    // Die beiden Zahlen sind der Kern der spaeteren Karte "Gewinne": ohne sie
    // laesst sich kein Vorschlag mit einem anderen vergleichen.
    const report = checkTourFeasibility([
      stop({ visitId: "v-1", scheduledAt: "2026-09-08T09:00:00.000Z", durationMinutes: 30 }),
      stop({ visitId: "v-2", scheduledAt: "2026-09-08T10:00:00.000Z", durationMinutes: 45, ...B }),
    ]);

    expect(report.totalCareMinutes).toBe(75);
    expect(report.totalTravelMinutes).toBeGreaterThan(0);
  });

  it("haelt eine Tour mit einem einzigen Besuch fuer fahrbar", () => {
    // Es gibt keinen Uebergang, also keinen Verstoss -- und keine Fahrzeit.
    const report = checkTourFeasibility([
      stop({ visitId: "v-1", scheduledAt: "2026-09-08T09:00:00.000Z" }),
    ]);

    expect(report.feasible).toBe(true);
    expect(report.totalTravelMinutes).toBe(0);
    expect(report.totalCareMinutes).toBe(30);
  });

  it("kommt mit einer leeren Tour zurecht", () => {
    expect(checkTourFeasibility([])).toMatchObject({
      feasible: true,
      violations: [],
      totalTravelMinutes: 0,
      totalCareMinutes: 0,
    });
  });

  it("laesst einen Uebergang GENAU auf die Minute durchgehen", () => {
    // Die Grenze gehoert festgelegt: passt es auf die Minute, ist es machbar.
    // Sonst haengt das Ergebnis an einer Sekunde Rundung.
    const dauer = 30;
    const fahrt = travelMinutes(A, B);
    const start = new Date("2026-09-08T09:00:00.000Z");
    const exakt = new Date(start.getTime() + (dauer + fahrt) * 60_000);

    const report = checkTourFeasibility([
      stop({ visitId: "v-1", scheduledAt: start.toISOString(), durationMinutes: dauer }),
      stop({ visitId: "v-2", scheduledAt: exakt.toISOString(), ...B }),
    ]);

    expect(report.feasible).toBe(true);
  });

  it("meldet eine Minute zu wenig als Verstoss", () => {
    // Die Gegenprobe zur Grenze.
    const dauer = 30;
    const fahrt = travelMinutes(A, B);
    const start = new Date("2026-09-08T09:00:00.000Z");
    const zuFrueh = new Date(start.getTime() + (dauer + fahrt - 1) * 60_000);

    const report = checkTourFeasibility([
      stop({ visitId: "v-1", scheduledAt: start.toISOString(), durationMinutes: dauer }),
      stop({ visitId: "v-2", scheduledAt: zuFrueh.toISOString(), ...B }),
    ]);

    expect(report.feasible).toBe(false);
    expect(report.violations[0]!.lateByMinutes).toBe(1);
  });
});
