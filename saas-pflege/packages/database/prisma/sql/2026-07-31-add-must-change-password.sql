-- Erzwungener Passwortwechsel beim ersten Login.
-- Additif et idempotent. Appliqué via prisma db execute (le moteur de diff
-- Prisma est peu fiable à travers le pooler Supavisor ; cf.
-- 2026-07-13-add-gps-positions.sql).
--
-- Le flag est posé à true par le backend chaque fois qu'un admin génère un mot
-- de passe temporaire (POST /users/fachkraft et POST /users/:id/reset-password)
-- et remis à false par POST /auth/change-password.
--
-- DEFAULT false : les comptes existants (admins ayant choisi leur mot de passe)
-- ne sont pas impactés par la migration.
ALTER TABLE "public"."users"
  ADD COLUMN IF NOT EXISTS "must_change_password" BOOLEAN NOT NULL DEFAULT false;
