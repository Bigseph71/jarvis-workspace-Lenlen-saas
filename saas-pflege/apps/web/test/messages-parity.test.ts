import { describe, it, expect } from "vitest";
import de from "../messages/de.json";
import en from "../messages/en.json";
import fr from "../messages/fr.json";

/**
 * Drei Sprachdateien, ein Schluesselbaum.
 *
 * Ein Schluessel, den nur die deutsche Datei kennt, faellt im Betrieb nicht
 * auf: die Anwendung laeuft auf Deutsch. Der englische oder franzoesische
 * Bildschirm zeigt dann den rohen Schluesselnamen -- und gesehen wird das
 * erst von dem, der ihn braucht.
 */

function keys(value: unknown, prefix = ""): string[] {
  if (typeof value !== "object" || value === null) return [prefix];
  return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) =>
    keys(child, prefix ? `${prefix}.${key}` : key),
  );
}

const REFERENCE = keys(de).sort();

describe.each([
  ["en", en],
  ["fr", fr],
])("Nachrichten %s", (_locale, messages) => {
  it("kennt genau dieselben Schlüssel wie Deutsch", () => {
    expect(keys(messages).sort()).toEqual(REFERENCE);
  });
});
