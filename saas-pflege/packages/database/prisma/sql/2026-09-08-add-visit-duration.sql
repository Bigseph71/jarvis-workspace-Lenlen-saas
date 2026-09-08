-- Dauer eines Besuchs: Vorgabe am Patienten, Ausnahme am Besuch.
--
-- Anlass: die Planung konnte bis hierher nicht sagen, WANN eine Fachkraft den
-- Patienten verlässt -- also auch nicht, ob sie beim nächsten rechtzeitig sein
-- kann. Der bestehende Mindestabstand von 15 Minuten zwischen zwei Besuchen
-- (visit.rules) ist ein Schutz gegen Doppelbuchung, kein Fahrplan: 15 Minuten
-- reichen weder für eine Ganzkörperpflege noch für die Fahrt danach.
--
-- Idempotent (IF NOT EXISTS), wie die übrigen Dateien dieses Verzeichnisses.

-- Übliche Dauer beim Patienten. 30 Minuten als Vorgabe -- der gängige Wert in
-- der ambulanten Pflege im städtischen Umfeld.
--
-- MIT Vorgabe und nicht nullable: ein Altbestand ohne Dauer ergäbe eine Tour,
-- die rechnerisch immer machbar ist, und damit eine Prüfung, die stillschweigend
-- nichts prüft.
ALTER TABLE "public"."patients"
  ADD COLUMN IF NOT EXISTS "care_minutes" INTEGER NOT NULL DEFAULT 30;

-- Abweichende Dauer dieses einen Besuchs. NULL = die Vorgabe des Patienten gilt.
--
-- Ohne Vorgabe: eine Zahl hier heisst "jemand hat sich etwas dabei gedacht".
-- Stünde überall eine Kopie, liefe eine Änderung am Patienten an allen
-- bestehenden Besuchen vorbei.
ALTER TABLE "public"."visits"
  ADD COLUMN IF NOT EXISTS "duration_minutes" INTEGER;

-- Untergrenzen als CHECK und nicht nur in der Anwendung: eine Dauer von 0 oder
-- weniger machte jede Tour machbar, und ein Import (Phase 3) umgeht die
-- Anwendungsschicht.
ALTER TABLE "public"."patients"
  DROP CONSTRAINT IF EXISTS "patients_care_minutes_positive";
ALTER TABLE "public"."patients"
  ADD CONSTRAINT "patients_care_minutes_positive" CHECK ("care_minutes" > 0);

ALTER TABLE "public"."visits"
  DROP CONSTRAINT IF EXISTS "visits_duration_minutes_positive";
ALTER TABLE "public"."visits"
  ADD CONSTRAINT "visits_duration_minutes_positive"
  CHECK ("duration_minutes" IS NULL OR "duration_minutes" > 0);
