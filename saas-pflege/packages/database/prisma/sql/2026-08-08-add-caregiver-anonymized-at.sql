-- ─────────────────────────────────────────────────────────────────────────
--  Anonymisierung einer Fachkraft (DSGVO Art. 17)
-- ─────────────────────────────────────────────────────────────────────────
-- Markiert, dass Name und Konto einer Fachkraft unwiderruflich entfernt
-- wurden. Der Datensatz selbst BLEIBT: Besuche, Touren und Audit-Eintraege
-- zeigen weiter auf ihn, sonst ginge die Nachvollziehbarkeit verloren, wer
-- eine Pflegeleistung erbracht hat (Regel 4) und wer auf Patientendaten
-- zugegriffen hat.
--
-- Zugleich der Idempotenz-Anker: ein zweiter Anonymisierungsaufruf findet die
-- Spalte gesetzt und bricht ab, statt einen bereits anonymisierten Satz
-- erneut zu ueberschreiben.

ALTER TABLE "public"."caregivers"
  ADD COLUMN IF NOT EXISTS "anonymized_at" TIMESTAMP(3);
