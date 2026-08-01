import { z } from "zod";

/**
 * Zod-Bausteine, die mehrere Module teilen. Sie liegen hier und nicht im
 * Schema-File eines Moduls, damit sich zwei Module nicht gegenseitig
 * importieren müssen (Zirkelbezug).
 */

/**
 * Datum ohne Uhrzeit, auf UTC-Mitternacht normalisiert (die DB-Spalten sind
 * DATE).
 *
 * Der Rückweg-Vergleich ist kein Zierrat: V8 nimmt "2026-02-31" klaglos an und
 * macht daraus den 3. März. Ein Tippfehler in einer CSV-Zeile würde sonst als
 * gültiges, nur falsches Datum durchlaufen. Nur wenn das geparste Datum
 * denselben Tag zurückliefert, war die Eingabe wirklich einer.
 */
export const dateOnlySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Datum im Format YYYY-MM-DD erwartet")
  .refine((v) => {
    const parsed = new Date(`${v}T00:00:00.000Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === v;
  }, "Ungültiges Datum")
  .transform((v) => new Date(`${v}T00:00:00.000Z`));

/** Zeitpunkt nach ISO 8601 (z.B. `updatedSince` bei inkrementeller Synchronisation). */
export const isoDateTimeSchema = z
  .string()
  .datetime()
  .transform((v) => new Date(v));
