-- ─────────────────────────────────────────────────────────────────────────
--  Loeschverlangen eines Patienten (DSGVO Art. 17 / Art. 18)
-- ─────────────────────────────────────────────────────────────────────────
-- Anders als bei einer Fachkraft kann ein Patientendatensatz nicht sofort
-- anonymisiert werden: die Pflegedokumentation unterliegt einer
-- Aufbewahrungsfrist (§ 630f BGB, zehn Jahre nach Ende der Behandlung), und
-- Art. 17 Abs. 3 lit. b nimmt genau solche Pflichten von der Loeschung aus.
--
-- Daher zwei Zeitstempel statt einem :
--   erasure_requested_at  Loeschverlangen eingegangen, Frist laeuft noch.
--                         Bis dahin gilt Art. 18 (Einschraenkung der
--                         Verarbeitung), operativ ueber is_active=false
--                         durchgesetzt. Es wird NICHTS geloescht.
--   anonymized_at         Frist abgelaufen und tatsaechlich anonymisiert.
--
-- Der erste Zeitstempel unterscheidet zugleich eine Sperrung auf Verlangen
-- von einer gewoehnlichen Deaktivierung: is_active=false allein sagt nicht,
-- warum der Datensatz ruht.

ALTER TABLE "public"."patients"
  ADD COLUMN IF NOT EXISTS "erasure_requested_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "anonymized_at"        TIMESTAMP(3);

-- Faellige Anonymisierungen finden: gesperrte Datensaetze, deren Frist
-- abgelaufen ist. Teilindex, weil die grosse Mehrheit der Zeilen kein
-- Loeschverlangen traegt.
CREATE INDEX IF NOT EXISTS "patients_erasure_requested_idx"
  ON "public"."patients"("organization_id", "erasure_requested_at")
  WHERE "erasure_requested_at" IS NOT NULL AND "anonymized_at" IS NULL;
