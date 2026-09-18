-- Contrôle de l'état réel du schéma. LECTURE SEULE, rien n'est modifié.
--
-- Pas une migration : le nom est volontairement sans date pour qu'il ne se
-- glisse pas dans la suite chronologique.
--
-- À coller dans l'éditeur SQL de Supabase (ou psql). Ne pas passer par
-- apply:sql, qui est fait pour appliquer, pas pour lire.
--
-- POURQUOI CE FICHIER EXISTE
--
-- Le script apply:sql découpe les fichiers sur « ; ». Un bloc
-- « DO $$ ... END $$; » en contient plusieurs : découpé, il produit des
-- fragments invalides, et le script s'arrête là — après avoir exécuté ce qui
-- précédait. Trois migrations du dossier contiennent un tel bloc :
--
--   2026-07-15-add-billing.sql       CREATE TYPE "InvoiceStatus"
--   2026-08-01-add-hr-module.sql     CREATE TYPE x3, puis les policies RLS
--   2026-08-30-add-incident-ack.sql  la clé étrangère de l'accusé de réception
--
-- Les deux premières sont antérieures au script (créé le 2026-08-21) : elles
-- ont donc été appliquées par la manœuvre manuelle d'avant, qui collait le
-- fichier entier, et leurs blocs sont vraisemblablement passés. La troisième
-- lui est postérieure. Si elle a été appliquée avec apply:sql, elle s'est
-- arrêtée au bloc DO, et il manque alors DEUX objets : la clé étrangère ET
-- l'index qui la suit dans le fichier.
--
-- Rien ne l'aurait signalé : l'application fonctionne sans, Prisma gérant les
-- relations côté applicatif. Seules la suppression d'un utilisateur ayant
-- acquitté un incident (référence morte) et la lenteur de la liste d'alertes
-- finiraient par le révéler.
--
-- Le CI ne répond pas à la question : il construit sa base avec
-- `prisma db push`, à partir du schéma, sans jouer un seul de ces fichiers.

-- ── 1. Clés étrangères attendues ─────────────────────────────────────────
-- Une ligne par contrainte trouvée. Une ligne absente = contrainte manquante.
SELECT
  rel.relname        AS table_name,
  con.conname        AS constraint_name,
  pg_get_constraintdef(con.oid) AS definition
FROM pg_constraint con
JOIN pg_class rel ON rel.oid = con.conrelid
JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
WHERE nsp.nspname = 'public'
  AND con.contype = 'f'
  AND con.conname IN (
    -- 2026-08-30-add-incident-ack.sql
    'visits_incident_ack_by_user_id_fkey',
    -- 2026-09-18-add-user-invitations.sql
    'user_invitations_organization_id_fkey',
    'user_invitations_user_id_fkey',
    'user_invitations_created_by_user_id_fkey'
  )
ORDER BY rel.relname, con.conname;

-- ── 2. Index attendus ────────────────────────────────────────────────────
SELECT tablename, indexname
FROM pg_indexes
WHERE schemaname = 'public'
  AND indexname IN (
    'visits_organization_id_incident_ack_at_idx',
    'user_invitations_token_hash_key',
    'user_invitations_organization_id_idx',
    'user_invitations_user_id_idx'
  )
ORDER BY tablename, indexname;

-- ── 3. Types énumérés des blocs DO antérieurs au script ──────────────────
-- Attendu : InvoiceStatus, AbsenceType, AbsenceStatus, ExternalSource.
-- Un manque ici veut dire que le bloc DO correspondant n'est jamais passé, et
-- alors les tables qui suivaient dans le même fichier manquent aussi.
SELECT t.typname
FROM pg_type t
JOIN pg_namespace n ON n.oid = t.typnamespace
WHERE n.nspname = 'public'
  AND t.typname IN ('InvoiceStatus', 'AbsenceType', 'AbsenceStatus', 'ExternalSource')
ORDER BY t.typname;

-- ── 4. Policies RLS : une par table porteuse d'organization_id ───────────
-- Attendu : une ligne « tenant_isolation » pour chacune des tables listées
-- dans rls.sql, y compris contracts, work_schedules, absences (posées par un
-- bloc DO dans 2026-08-01-add-hr-module.sql) et user_invitations.
--
-- Une table à organization_id SANS policy n'est pas isolée : sur le chemin
-- applicatif (rôle app_user), elle laisserait un tenant lire les lignes d'un
-- autre. C'est la vérification la plus importante de ce fichier.
SELECT
  c.relname AS table_name,
  c.relrowsecurity AS rls_active,
  p.polname AS policy_name
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
LEFT JOIN pg_policy p ON p.polrelid = c.oid
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
  AND EXISTS (
    SELECT 1 FROM information_schema.columns col
    WHERE col.table_schema = 'public'
      AND col.table_name = c.relname
      AND col.column_name = 'organization_id'
  )
ORDER BY c.relname;

-- ── Que faire du résultat ────────────────────────────────────────────────
--
-- Section 1 ou 2 incomplète pour « visits » :
--   appliquer 2026-09-19-repair-incident-ack.sql
--
-- Section 1 ou 2 incomplète pour « user_invitations » :
--   la migration 2026-09-18-add-user-invitations.sql n'a pas été appliquée,
--   ou pas jusqu'au bout. La rejouer : elle est idempotente.
--
-- Section 3 incomplète :
--   la migration correspondante n'est pas passée du tout. À appliquer avec
--   psql (ces blocs DO sont hors de portée d'apply:sql) :
--     psql "$DATABASE_URL" -f prisma/sql/<fichier>.sql
--
-- Section 4 : une table avec rls_active = false ou policy_name = NULL :
--   rejouer rls.sql, qui repose toutes les policies et est idempotent :
--     psql "$DATABASE_URL" -f prisma/rls.sql
