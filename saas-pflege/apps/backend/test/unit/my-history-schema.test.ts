import { describe, it, expect } from "vitest";
import { myHistoryQuerySchema } from "../../src/modules/visits/visit.schemas.js";

/**
 * Abfrage-Parameter des Verlaufs (GET /visits/my-history?page=&limit=).
 *
 * `limit` und nicht `pageSize` wie im übrigen Backend: die mobile App blättert
 * eine fortlaufende Liste, kein Tabellengitter mit wählbarer Seitengrösse. Das
 * ist eine bewusste Ausnahme und deshalb festgehalten – wer den Namen später
 * angleicht, bricht die App, ohne dass es der Typprüfer merkt.
 */
describe("myHistoryQuerySchema", () => {
  it("beginnt ohne Angabe bei Seite 1 mit 20 Einträgen", () => {
    expect(myHistoryQuerySchema.parse({})).toEqual({ page: 1, limit: 20 });
  });

  it("nimmt Zahlen als Zeichenkette an, wie sie aus der Adresse kommen", () => {
    expect(myHistoryQuerySchema.parse({ page: "3", limit: "50" })).toEqual({ page: 3, limit: 50 });
  });

  it("weist Seite 0 und negative Seiten ab", () => {
    // Sonst ergäbe toSkipTake ein negatives `skip`, und Prisma bräche mit
    // einem Fehler ab, der nichts mit der Ursache zu tun hat.
    expect(() => myHistoryQuerySchema.parse({ page: "0" })).toThrow();
    expect(() => myHistoryQuerySchema.parse({ page: "-1" })).toThrow();
  });

  it("deckelt limit bei 100", () => {
    // Ein offenes Limit machte aus einem Reiter der App eine Abfrage über
    // Jahre von Besuchen.
    expect(() => myHistoryQuerySchema.parse({ limit: "101" })).toThrow();
    expect(myHistoryQuerySchema.parse({ limit: "100" }).limit).toBe(100);
  });

  it("weist ein limit von 0 ab", () => {
    expect(() => myHistoryQuerySchema.parse({ limit: "0" })).toThrow();
  });
});
