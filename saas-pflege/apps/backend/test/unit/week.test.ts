import { describe, it, expect } from "vitest";
import { weekdayCode, startOfISOWeek, weekRange, dayRange } from "../../src/lib/week.js";

/**
 * Tages- und Wochengrenzen in der Anwendungs-Zeitzone (Europe/Berlin).
 *
 * Was hier hängt, ist fachlich: welche Besuche zu "heute" gehören, in welche
 * Woche ein Besuch fällt (Regel 1 und 3) und welcher Wochentag für die
 * Arbeitstage gilt (Regel 5). Früher wurde in UTC gerechnet – ein Besuch um
 * 01:00 Uhr deutscher Zeit lag damit am Vortag, in der Vorwoche und auf dem
 * falschen Wochentag.
 */

const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

// Zeitumstellung EU 2026: Sommerzeit ab 29.03., zurück am 25.10.
const SUMMER = "2026-06-26T12:00:00Z"; // MESZ, UTC+2
const WINTER = "2026-01-15T12:00:00Z"; // MEZ, UTC+1

describe("weekdayCode", () => {
  it("nennt den Wochentag der ORTSZEIT, nicht den von UTC", () => {
    // Sonntag 23:00 UTC ist in Berlin bereits Montag 01:00.
    // In UTC gerechnet hörte eine montags arbeitende Fachkraft
    // "arbeitet nicht am SUN".
    expect(weekdayCode(new Date("2026-08-09T23:00:00Z"))).toBe("MON");
    expect(weekdayCode(new Date("2026-08-09T21:00:00Z"))).toBe("SUN");
  });

  it("bleibt für Zeitpunkte mitten am Tag unverändert", () => {
    expect(weekdayCode(new Date("2026-01-01T12:00:00Z"))).toBe("THU");
    expect(weekdayCode(new Date("2026-01-04T12:00:00Z"))).toBe("SUN");
    expect(weekdayCode(new Date("2026-01-05T12:00:00Z"))).toBe("MON");
  });

  it("richtet sich nach der übergebenen Zone", () => {
    const instant = new Date("2026-08-09T23:00:00Z");
    expect(weekdayCode(instant, "Europe/Berlin")).toBe("MON");
    expect(weekdayCode(instant, "UTC")).toBe("SUN");
  });
});

describe("dayRange", () => {
  it("umfasst den Kalendertag der Ortszeit", () => {
    // Sommerzeit: der 9.8. läuft in Berlin von 8.8. 22:00 UTC bis 9.8. 22:00 UTC.
    const { start, end } = dayRange(new Date("2026-08-09T12:00:00Z"));
    expect(start.toISOString()).toBe("2026-08-08T22:00:00.000Z");
    expect(end.toISOString()).toBe("2026-08-09T22:00:00.000Z");
  });

  it("ordnet einen Besuch kurz nach Mitternacht dem RICHTIGEN Tag zu", () => {
    // Genau der beobachtete Fehler: 00:30 Ortszeit am 9.8. ist 22:30 UTC am 8.8.
    // In UTC gerechnet fiel dieser Besuch aus "heute" heraus und war in der App
    // unsichtbar.
    const visit = new Date("2026-08-08T22:30:00Z"); // = 9.8. 00:30 Ortszeit
    const { start, end } = dayRange(new Date("2026-08-09T12:00:00Z"));
    expect(visit.getTime()).toBeGreaterThanOrEqual(start.getTime());
    expect(visit.getTime()).toBeLessThan(end.getTime());
  });

  it("schließt den Vortag aus", () => {
    const previous = new Date("2026-08-08T21:30:00Z"); // = 8.8. 23:30 Ortszeit
    const { start } = dayRange(new Date("2026-08-09T12:00:00Z"));
    expect(previous.getTime()).toBeLessThan(start.getTime());
  });

  it("dauert im Winter ebenfalls 24 h, nur um eine Stunde verschoben", () => {
    const { start, end } = dayRange(new Date(WINTER));
    expect(start.toISOString()).toBe("2026-01-14T23:00:00.000Z");
    expect(end.getTime() - start.getTime()).toBe(DAY_MS);
  });

  it("hat am Tag der Umstellung 23 bzw. 25 Stunden", () => {
    // Die Addition von 24 h wäre hier falsch: der Kalendertag ist kürzer/länger.
    const spring = dayRange(new Date("2026-03-29T12:00:00Z"));
    expect(spring.end.getTime() - spring.start.getTime()).toBe(23 * HOUR_MS);

    const autumn = dayRange(new Date("2026-10-25T12:00:00Z"));
    expect(autumn.end.getTime() - autumn.start.getTime()).toBe(25 * HOUR_MS);
  });
});

describe("startOfISOWeek", () => {
  it("liefert Montag 00:00 ORTSZEIT", () => {
    const monday = startOfISOWeek(new Date(SUMMER));
    expect(weekdayCode(monday)).toBe("MON");
    // 00:00 in Berlin = 22:00 UTC am Vortag (Sommerzeit).
    expect(monday.toISOString()).toBe("2026-06-21T22:00:00.000Z");
  });

  it("behandelt Sonntag als Ende, nicht als Anfang der Woche", () => {
    const monday = startOfISOWeek(new Date("2026-01-04T12:00:00Z")); // So
    expect(weekdayCode(monday)).toBe("MON");
    expect(monday.toISOString()).toBe("2025-12-28T23:00:00.000Z"); // = 29.12. 00:00 MEZ
  });

  it("zieht einen Besuch nach Mitternacht in die RICHTIGE Woche", () => {
    // Montag 01:00 Ortszeit = Sonntag 23:00 UTC. In UTC gerechnet landete
    // dieser Besuch in der Vorwoche – Regel 1 hätte einen zweiten Besuch
    // derselben Woche nicht mehr als Dublette erkannt.
    const mondayEarly = new Date("2026-08-09T23:00:00Z"); // = Mo 10.8. 01:00
    const monday = startOfISOWeek(mondayEarly);
    expect(monday.toISOString()).toBe("2026-08-09T22:00:00.000Z"); // Mo 10.8. 00:00 MESZ
  });
});

describe("weekRange", () => {
  it("ist ein halboffenes Intervall, das das Datum enthält", () => {
    const d = new Date(SUMMER);
    const { start, end } = weekRange(d);
    expect(weekdayCode(start)).toBe("MON");
    expect(end.getTime() - start.getTime()).toBe(7 * DAY_MS);
    expect(d.getTime()).toBeGreaterThanOrEqual(start.getTime());
    expect(d.getTime()).toBeLessThan(end.getTime());
  });

  it("dauert in der Umstellungswoche 167 bzw. 169 Stunden", () => {
    // Eine feste Addition von 7×24 h verschöbe die Wochengrenze um eine Stunde
    // in die Nachbarwoche – ein Besuch am Montagmorgen zählte dann noch zur
    // Vorwoche.
    const spring = weekRange(new Date("2026-03-25T12:00:00Z"));
    expect(spring.end.getTime() - spring.start.getTime()).toBe(167 * HOUR_MS);

    const autumn = weekRange(new Date("2026-10-21T12:00:00Z"));
    expect(autumn.end.getTime() - autumn.start.getTime()).toBe(169 * HOUR_MS);
  });

  it("beginnt und endet jeweils an einem Montag", () => {
    for (const iso of [SUMMER, WINTER, "2026-03-29T12:00:00Z", "2026-10-25T12:00:00Z"]) {
      const { start, end } = weekRange(new Date(iso));
      expect(weekdayCode(start)).toBe("MON");
      expect(weekdayCode(end)).toBe("MON");
    }
  });
});
