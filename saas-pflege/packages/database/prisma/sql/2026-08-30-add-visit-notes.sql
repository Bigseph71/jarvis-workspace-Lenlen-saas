-- Besuchsnotizen der Fachkraft (Mobile-App) und Patienten-Verlauf (Web).
-- Additif et idempotent.
--
-- Mode d'application : voir la note en tête de 2026-07-04-add-pointage-gps.sql.
--
--     pnpm --filter @len-len/database apply:sql prisma/sql/2026-08-30-add-visit-notes.sql
--
-- À APPLIQUER AVANT de déployer le code qui en dépend. Le client Prisma
-- sélectionne ces colonnes explicitement : sans elles, toute lecture de visite
-- échoue — la tournée du jour, la planification et le tableau de bord avec.
--
-- La note vit sur la visite, pas dans une table dédiée : elle appartient à un
-- seul besuch, n'a pas d'existence propre et n'est jamais lue sans lui.

ALTER TABLE "public"."visits"
  ADD COLUMN IF NOT EXISTS "visit_note" TEXT,
  ADD COLUMN IF NOT EXISTS "has_incident" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "visit_note_written_at" TIMESTAMP(3);

-- Les incidents sont ce que la coordination cherche en premier dans le
-- Verlauf ; le tri par date est déjà couvert par visits_patient_id_scheduled_at_idx.
CREATE INDEX IF NOT EXISTS "visits_organization_id_has_incident_scheduled_at_idx"
  ON "public"."visits" ("organization_id", "has_incident", "scheduled_at");

-- Contrôle après application :
--   SELECT column_name, data_type, column_default
--     FROM information_schema.columns
--    WHERE table_name = 'visits'
--      AND column_name IN ('visit_note', 'has_incident', 'visit_note_written_at');
-- Trois lignes attendues, has_incident avec DEFAULT false.
--
-- La RLS de la table visits couvre ces colonnes sans changement : les policies
-- portent sur la ligne, pas sur les colonnes (voir prisma/rls.sql).
