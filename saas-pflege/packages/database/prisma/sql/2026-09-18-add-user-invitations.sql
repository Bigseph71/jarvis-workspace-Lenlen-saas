-- Einladungen: Zugang zu einem Konto, ohne dass je ein Passwort im Klartext
-- durch die API geht.
-- Additif et idempotent.
--
--     pnpm --filter @len-len/database apply:sql prisma/sql/2026-09-18-add-user-invitations.sql
--
-- À APPLIQUER AVANT de déployer le code qui en dépend.
--
-- Pourquoi une table et pas deux colonnes sur "users" : la requête de login
-- lit users SANS select explicite, donc Prisma énumère chaque colonne du
-- modèle dans le SQL. Ajouter une colonne à users modifierait la requête
-- d'authentification, exactement la situation qui a déjà mis la production à
-- terre (le pooler Supabase servait un plan antérieur à la migration). Ici, si
-- cette migration est oubliée, c'est l'invitation qui échoue, pas la connexion.
--
-- Le token n'est stocké que haché (HMAC-SHA256, domaine "invitation:").
-- Personne, pas même avec un accès en lecture à la base, ne peut reconstituer
-- un lien d'invitation.

CREATE TABLE IF NOT EXISTS "public"."user_invitations" (
  "id"                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "organization_id"    UUID NOT NULL,
  "user_id"            UUID NOT NULL,
  "token_hash"         TEXT NOT NULL,
  "expires_at"         TIMESTAMP(3) NOT NULL,
  "used_at"            TIMESTAMP(3),
  "created_by_user_id" UUID,
  "created_at"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Le hash est la clé de recherche de l'endpoint public : unique et indexé.
CREATE UNIQUE INDEX IF NOT EXISTS "user_invitations_token_hash_key"
  ON "public"."user_invitations" ("token_hash");

CREATE INDEX IF NOT EXISTS "user_invitations_organization_id_idx"
  ON "public"."user_invitations" ("organization_id");

CREATE INDEX IF NOT EXISTS "user_invitations_user_id_idx"
  ON "public"."user_invitations" ("user_id");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'user_invitations_organization_id_fkey'
  ) THEN
    ALTER TABLE "public"."user_invitations"
      ADD CONSTRAINT "user_invitations_organization_id_fkey"
      FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  -- CASCADE : une invitation sans compte n'a plus d'objet.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'user_invitations_user_id_fkey'
  ) THEN
    ALTER TABLE "public"."user_invitations"
      ADD CONSTRAINT "user_invitations_user_id_fkey"
      FOREIGN KEY ("user_id") REFERENCES "public"."users"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  -- SET NULL : le départ de l'admin qui a invité ne doit pas effacer la trace
  -- de l'invitation elle-même.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'user_invitations_created_by_user_id_fkey'
  ) THEN
    ALTER TABLE "public"."user_invitations"
      ADD CONSTRAINT "user_invitations_created_by_user_id_fkey"
      FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- RLS, comme toute table porteuse d'organization_id. Les deux endpoints
-- publics (consultation et consommation du lien) passent par le chemin
-- système, propriétaire de la table, exactement comme le login : au moment où
-- ils s'exécutent, aucun tenant n'est encore connu.
ALTER TABLE "public"."user_invitations" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "public"."user_invitations";
CREATE POLICY tenant_isolation ON "public"."user_invitations"
  USING (organization_id = current_setting('app.current_org', true)::uuid)
  WITH CHECK (organization_id = current_setting('app.current_org', true)::uuid);

-- Contrôle après application :
--   SELECT column_name, data_type
--     FROM information_schema.columns
--    WHERE table_name = 'user_invitations'
--    ORDER BY ordinal_position;
