-- Date de sortie d'une fachkraft.
-- Additif et idempotent. Appliqué le 2026-08-01 sur la base Supabase du projet,
-- méthode dans 2026-08-01-add-hr-module.sql.
--
-- Pourquoi une colonne dédiée plutôt que updated_at : updated_at bouge à la
-- moindre modification de la fiche, il ne dit donc pas quand la fachkraft est
-- sortie. Or c'est cette date qui borne son contrat (deactivateCaregiver
-- clôture le contrat en vigueur à ce jour-là), et un contrat mal daté fausse
-- ensuite les rapports d'heures et l'export DATEV.
--
-- Nullable : les fachkräfte déjà désactivées avant cette migration n'ont pas de
-- date de sortie connue. Le rattrapage les signale au lieu d'en inventer une.
ALTER TABLE "public"."caregivers"
  ADD COLUMN IF NOT EXISTS "deactivated_at" TIMESTAMP(3);
