-- Löschung einer Organisation durch den Super-Admin (Panel /admin).
-- Additif et idempotent.
--
-- Mode d'application : voir la note en tête de 2026-07-04-add-pointage-gps.sql.
-- En bref, `prisma db execute` ne passe plus par le pooler Supabase ; utiliser
--
--     pnpm --filter @len-len/database apply:sql prisma/sql/2026-08-20-add-organization-soft-delete.sql
--
-- À APPLIQUER AVANT de déployer le code qui en dépend : sans ces colonnes,
-- toute lecture d'organisation par Prisma échoue (le client les sélectionne
-- explicitement), ce qui coucherait l'API entière, pas seulement le panel.

ALTER TABLE "public"."organizations"
  ADD COLUMN IF NOT EXISTS "deleted_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "deletion_reason" TEXT,
  ADD COLUMN IF NOT EXISTS "deleted_by_user_id" UUID;

-- Le panel liste et compte par statut en excluant systématiquement les
-- organisations supprimées.
CREATE INDEX IF NOT EXISTS "organizations_deleted_at_subscription_status_idx"
  ON "public"."organizations" ("deleted_at", "subscription_status");

-- Contrôle après application :
--   SELECT column_name FROM information_schema.columns
--    WHERE table_name = 'organizations'
--      AND column_name IN ('deleted_at', 'deletion_reason', 'deleted_by_user_id');
-- Trois lignes attendues.
