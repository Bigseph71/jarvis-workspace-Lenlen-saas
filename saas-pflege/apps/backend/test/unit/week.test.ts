import { describe, it, expect } from "vitest";
import { weekdayCode, startOfISOWeek, weekRange, dayRange } from "../../src/lib/week.js";

const DAY_MS = 86_400_000;

describe("weekdayCode", () => {
  it("ordnet bekannte Daten dem richtigen Wochentag zu (UTC)", () => {
    // 2026-01-01 ist ein Donnerstag, 2026-01-04 ein Sonntag, 2026-01-05 Montag.
    expect(weekdayCode(new Date(Date.UTC(2026, 0, 1)))).toBe("THU");
    expect(weekdayCode(new Date(Date.UTC(2026, 0, 4)))).toBe("SUN");
    expect(weekdayCode(new Date(Date.UTC(2026, 0, 5)))).toBe("MON");
  });
});

describe("startOfISOWeek", () => {
  it("liefert immer den Montag 00:00 UTC", () => {
    const monday = startOfISOWeek(new Date("2026-06-26T15:30:00Z"));
    expect(weekdayCode(monday)).toBe("MON");
    expect(monday.getUTCHours()).toBe(0);
    expect(monday.getUTCMinutes()).toBe(0);
  });

  it("behandelt Sonntag als Ende, nicht als Anfang der Woche", () => {
    const sunday = new Date(Date.UTC(2026, 0, 4)); // So
    const monday = startOfISOWeek(sunday);
    // Montag davor = 2025-12-29
    expect(monday.toISOString().slice(0, 10)).toBe("2025-12-29");
  });
});

describe("weekRange", () => {
  it("ist ein halboffenes 7-Tage-Intervall, das das Datum enthält", () => {
    const d = new Date("2026-06-26T12:00:00Z");
    const { start, end } = weekRange(d);
    expect(weekdayCode(start)).toBe("MON");
    expect(end.getTime() - start.getTime()).toBe(7 * DAY_MS);
    expect(d.getTime()).toBeGreaterThanOrEqual(start.getTime());
    expect(d.getTime()).toBeLessThan(end.getTime());
  });
});

describe("dayRange", () => {
  it("spannt genau 24h ab Mitternacht UTC", () => {
    const { start, end } = dayRange(new Date("2026-06-26T23:59:00Z"));
    expect(start.toISOString()).toBe("2026-06-26T00:00:00.000Z");
    expect(end.getTime() - start.getTime()).toBe(DAY_MS);
  });
});
