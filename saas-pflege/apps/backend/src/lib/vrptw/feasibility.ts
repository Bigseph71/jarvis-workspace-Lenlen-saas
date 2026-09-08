import { haversineKm } from "../geo.js";

/**
 * Ist eine Tour überhaupt fahrbar?
 *
 * Der Optimierer ordnete die Besuche bisher nach Nähe und war damit fertig. Ob
 * die Fachkraft die Reihenfolge auch SCHAFFT, fragte niemand: der einzige
 * zeitliche Schutz war ein Mindestabstand von 15 Minuten zwischen zwei
 * Besuchen (visit.rules) -- ein Riegel gegen Doppelbuchung, kein Fahrplan.
 * Fünfzehn Minuten reichen weder für eine Ganzkörperpflege noch für die Fahrt
 * danach, und eine Tour aus solchen Terminen sieht auf dem Bildschirm
 * tadellos aus.
 *
 * Hier wird deshalb gerechnet, was tatsächlich vergeht:
 *
 *     Abfahrt bei A  = Termin A + Dauer A
 *     Ankunft bei B  = Abfahrt bei A + Fahrzeit(A -> B)
 *     Verstoss       wenn Ankunft bei B nach Termin B liegt
 *
 * DETERMINISTISCH, ohne Routing-Dienst. Die Fahrzeit kommt aus der
 * Luftlinie, einem Umwegfaktor und einer Durchschnittsgeschwindigkeit. Das ist
 * gröber als eine echte Route, aber es hat drei Eigenschaften, die hier mehr
 * wiegen: es kostet nichts, es braucht kein Netz mitten in einem Optimierungs-
 * lauf mit 30-Sekunden-Frist, und es liefert bei gleicher Eingabe dasselbe
 * Ergebnis. Ohne Letzteres könnte eine Koordination zwei Vorschläge nicht
 * vergleichen -- was CLAUDE.md für die Gebietsaufteilung ausdrücklich verlangt.
 *
 * Ein echter Routing-Dienst (Distance Matrix) bleibt später möglich: er
 * ersetzt genau eine Funktion, `travelMinutes`.
 */

/** Durchschnittsgeschwindigkeit im Stadtverkehr, km/h. */
export const AVERAGE_SPEED_KMH = 25;

/**
 * Zuschlag von der Luftlinie auf die gefahrene Strecke.
 *
 * Strassen laufen nicht gerade. 1,3 ist der übliche Näherungswert für
 * städtische Netze; er ist bewusst eher zu hoch als zu niedrig, weil eine zu
 * optimistisch geschätzte Fahrzeit eine unfahrbare Tour als machbar ausweist --
 * und der Schaden liegt dann beim wartenden Patienten.
 */
export const DETOUR_FACTOR = 1.3;

/** Übliche Dauer, wenn am Patienten nichts hinterlegt ist. */
export const DEFAULT_CARE_MINUTES = 30;

export interface TravelOptions {
  speedKmh?: number;
  detourFactor?: number;
}

/**
 * Fahrzeit zwischen zwei Punkten, in Minuten.
 *
 * Aufgerundet auf ganze Minuten: eine Fahrzeit von 4,2 Minuten gibt es nicht,
 * und Abrunden liesse die Tour minutenweise optimistischer erscheinen, je mehr
 * Stationen sie hat.
 */
export function travelMinutes(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
  options: TravelOptions = {},
): number {
  const speed = options.speedKmh ?? AVERAGE_SPEED_KMH;
  const detour = options.detourFactor ?? DETOUR_FACTOR;
  if (speed <= 0) return 0;

  const km = haversineKm(from, to) * detour;
  return Math.ceil((km / speed) * 60);
}

/**
 * Dauer EINES Besuchs: die Ausnahme am Besuch schlägt die Vorgabe des
 * Patienten, und beide schlagen den Notnagel.
 *
 * Der Notnagel ist kein Schmuck: die Spalten sind neu, und ein Altbestand oder
 * ein Import (Phase 3) kann sie leer lassen. Eine Dauer von 0 machte jede Tour
 * machbar -- die Prüfung wäre da, aber wirkungslos.
 */
export function visitDurationMinutes(visit: {
  durationMinutes?: number | null;
  patient?: { careMinutes?: number | null } | null;
}): number {
  const own = visit.durationMinutes;
  if (typeof own === "number" && own > 0) return own;

  const patient = visit.patient?.careMinutes;
  if (typeof patient === "number" && patient > 0) return patient;

  return DEFAULT_CARE_MINUTES;
}

// ── Prüfung einer ganzen Tour ─────────────────────────────────────────────

export interface TourStop {
  visitId: string;
  patientName: string;
  /** Geplanter Termin. */
  scheduledAt: Date;
  durationMinutes: number;
  lat: number;
  lng: number;
}

/** Warum eine Tour in dieser Reihenfolge nicht aufgeht. */
export interface FeasibilityViolation {
  /** Der Besuch, der zu spät erreicht wird. */
  visitId: string;
  patientName: string;
  /** Der Besuch davor, aus dem die Verspätung stammt. */
  previousVisitId: string;
  scheduledAt: string;
  /** Frühestmögliche Ankunft nach Pflege und Fahrt. */
  earliestArrival: string;
  /** Um wie viele Minuten zu spät. Immer > 0. */
  lateByMinutes: number;
  travelMinutes: number;
  previousDurationMinutes: number;
}

export interface FeasibilityReport {
  feasible: boolean;
  violations: FeasibilityViolation[];
  /** Reine Fahrzeit der Tour, in Minuten. */
  totalTravelMinutes: number;
  /** Zeit beim Patienten, in Minuten. */
  totalCareMinutes: number;
  /**
   * Besuche, die NICHT geprüft werden konnten -- ihrem Patienten fehlen die
   * Koordinaten.
   *
   * Als eigene Zahl und nicht stillschweigend übersprungen: eine Tour, von der
   * die Hälfte ungeprüft blieb, darf nicht als "geht auf" durchgehen. Ein
   * ungeprüfter Übergang ist kein bestandener Übergang.
   */
  uncheckedVisits: number;
}

/**
 * Prüft eine Tour in DER Reihenfolge, in der sie gefahren werden soll.
 *
 * Die Reihenfolge ist die Eingabe, nicht das Ergebnis: geprüft wird der
 * Vorschlag des Optimierers, nicht eine beliebige Menge von Besuchen.
 *
 * Jeder Verstoss nennt BEIDE Besuche -- den zu spät erreichten und den davor.
 * Eine Meldung "Frau Vogel wird 12 Minuten zu spät erreicht" ohne den
 * Vorgänger lässt offen, wo man ansetzen müsste; mit ihm ist die Entscheidung
 * eine Frage von Sekunden.
 *
 * Die Verspätung PFLANZT SICH NICHT FORT: gerechnet wird ab dem geplanten
 * Termin des Vorgängers, nicht ab seiner verspäteten Ankunft. Sonst zöge ein
 * einziger enger Übergang am Morgen eine Kette von Verstössen durch den ganzen
 * Tag nach sich, und die Koordination sähe zwanzig Meldungen für ein Problem.
 */
export function checkTourFeasibility(
  stops: readonly TourStop[],
  options: TravelOptions = {},
): Omit<FeasibilityReport, "uncheckedVisits"> {
  const violations: FeasibilityViolation[] = [];
  let totalTravelMinutes = 0;
  let totalCareMinutes = 0;

  for (const [index, stop] of stops.entries()) {
    totalCareMinutes += stop.durationMinutes;
    if (index === 0) continue;

    const previous = stops[index - 1]!;
    const travel = travelMinutes(previous, stop, options);
    totalTravelMinutes += travel;

    const earliest = new Date(
      previous.scheduledAt.getTime() + (previous.durationMinutes + travel) * 60_000,
    );
    const lateByMs = earliest.getTime() - stop.scheduledAt.getTime();
    if (lateByMs <= 0) continue;

    violations.push({
      visitId: stop.visitId,
      patientName: stop.patientName,
      previousVisitId: previous.visitId,
      scheduledAt: stop.scheduledAt.toISOString(),
      earliestArrival: earliest.toISOString(),
      // Aufgerundet: eine Verspätung von 30 Sekunden ist eine Verspätung.
      lateByMinutes: Math.ceil(lateByMs / 60_000),
      travelMinutes: travel,
      previousDurationMinutes: previous.durationMinutes,
    });
  }

  return {
    feasible: violations.length === 0,
    violations,
    totalTravelMinutes,
    totalCareMinutes,
  };
}

// ── Eine ganze Tour aus Besuchen bilden und bewerten ──────────────────────

/** Was von einem Besuch gebraucht wird, ohne Prisma-Typen. */
export interface VisitForTour {
  id: string;
  scheduledAt: Date;
  durationMinutes?: number | null;
  patient: {
    firstName: string;
    lastName: string;
    careMinutes?: number | null;
    /** Prisma liefert Decimal; hier reicht alles, was Number() versteht. */
    latitude: unknown;
    longitude: unknown;
  } | null;
}

/**
 * Koordinate aus einem Prisma-Decimal, oder null.
 *
 * `null` und `undefined` werden ZUERST abgefangen, und das ist kein
 * Feilenstrich: `Number(null)` ergibt 0, und 0/0 ist ein gültiger Punkt --
 * vor der Küste Westafrikas. Ein Patient ohne Koordinaten läge damit
 * mehrere tausend Kilometer entfernt, die Fahrzeit ginge in die Stunden, und
 * die Tour meldete Verstösse, die es nicht gibt. Falsche Warnungen sind
 * schlimmer als keine: nach der dritten schaut niemand mehr hin.
 */
function coordinate(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const asNumber = Number(value);
  return Number.isFinite(asNumber) ? asNumber : null;
}

/**
 * Bewertet eine Tour aus ihren Besuchen.
 *
 * `order` ist die Reihenfolge, in der gefahren werden soll -- das Ergebnis des
 * Optimierers (routes.visits_order). Fehlt sie, gilt die Terminfolge: eine
 * noch nicht optimierte Tour wird so gefahren, wie sie geplant wurde.
 *
 * Besuche, die in `order` fehlen, werden nach Termin ANGEHÄNGT statt
 * weggelassen. Ein nachträglich angelegter Besuch steht sonst in keiner
 * Prüfung, und gerade der ist der wahrscheinlichste Grund, warum eine Tour
 * plötzlich nicht mehr aufgeht.
 *
 * Ohne Koordinaten lässt sich keine Fahrzeit rechnen. Diese Besuche fallen aus
 * der Prüfung heraus und werden GEZÄHLT (siehe uncheckedVisits) -- eine halb
 * geprüfte Tour ist keine geprüfte Tour.
 */
export function assessTour(
  visits: readonly VisitForTour[],
  order: readonly string[] | null,
  options: TravelOptions = {},
): FeasibilityReport {
  const byId = new Map(visits.map((visit) => [visit.id, visit]));
  const byTime = [...visits].sort(
    (a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime(),
  );

  const sequence: VisitForTour[] = [];
  const placed = new Set<string>();
  for (const id of order ?? []) {
    const visit = byId.get(id);
    if (visit && !placed.has(id)) {
      sequence.push(visit);
      placed.add(id);
    }
  }
  for (const visit of byTime) {
    if (!placed.has(visit.id)) sequence.push(visit);
  }

  let unchecked = 0;
  const stops: TourStop[] = [];
  for (const visit of sequence) {
    const lat = coordinate(visit.patient?.latitude);
    const lng = coordinate(visit.patient?.longitude);
    if (lat === null || lng === null) {
      unchecked += 1;
      continue;
    }
    stops.push({
      visitId: visit.id,
      patientName: `${visit.patient?.firstName ?? ""} ${visit.patient?.lastName ?? ""}`.trim(),
      scheduledAt: visit.scheduledAt,
      durationMinutes: visitDurationMinutes(visit),
      lat,
      lng,
    });
  }

  return { ...checkTourFeasibility(stops, options), uncheckedVisits: unchecked };
}
