-- Erzwungener Passwortwechsel beim ersten Login.
-- Additif et idempotent. Appliqué le 2026-07-31 via prisma.$executeRawUnsafe :
-- prisma db execute reste bloqué sur le pooler. Voir la note d'application dans
-- 2026-07-04-add-pointage-gps.sql.
--
-- Le flag est posé à true par le backend chaque fois qu'un admin génère un mot
-- de passe temporaire (POST /users/fachkraft et POST /users/:id/reset-password)
-- et remis à false par POST /auth/change-password.
--
-- DEFAULT false : les comptes existants (admins ayant choisi leur mot de passe)
-- ne sont pas impactés par la migration.
ALTER TABLE "public"."users"
  ADD COLUMN IF NOT EXISTS "must_change_password" BOOLEAN NOT NULL DEFAULT false;
