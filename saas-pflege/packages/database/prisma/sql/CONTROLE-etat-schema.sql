-- Contrôle de l'état réel du schéma. LECTURE SEULE, rien n'est modifié.
--
-- Pas une migration : le nom est volontairement sans date pour qu'il ne se
-- glisse pas dans la suite chronologique.
--
-- À coller dans l'éditeur SQL de Supabase (ou psql). Ne pas passer par
-- apply:sql, qui est fait pour appliquer, pas pour lire.
--
-- COMMENT LIRE LE RÉSULTAT
--
-- Chaque section rend UNE LIGNE PAR OBJET ATTENDU, avec une colonne `present`.
-- Il n'y a donc rien à compter ni à comparer de tête : ce qui manque est écrit
-- `false`, et le tri remonte ces lignes en premier. Si la première ligne d'une
-- section est `true`, la section entière est bonne.
--
-- Les sections listaient auparavant ce qui EXISTE, et un objet manquant se
-- lisait à l'absence d'une ligne. C'est la lecture où l'on se trompe : on voit
-- trois lignes, on ne les compte pas, on conclut que tout va bien.
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
-- `present = false` → contrainte absente. La colonne `migration` dit quoi
-- rejouer. La requête tient même si la table n'existe pas du tout.
SELECT
  attendu.table_name,
  attendu.constraint_name,
  (con.oid IS NOT NULL)         AS present,
  attendu.migration,
  pg_get_constraintdef(con.oid) AS definition
FROM (VALUES
  ('visits',           'visits_incident_ack_by_user_id_fkey',
   '2026-09-19-repair-incident-ack.sql'),
  ('user_invitations', 'user_invitations_organization_id_fkey',
   '2026-09-18-add-user-invitations.sql'),
  ('user_invitations', 'user_invitations_user_id_fkey',
   '2026-09-18-add-user-invitations.sql'),
  ('user_invitations', 'user_invitations_created_by_user_id_fkey',
   '2026-09-18-add-user-invitations.sql')
) AS attendu(table_name, constraint_name, migration)
LEFT JOIN pg_constraint con
       ON con.conname::text = attendu.constraint_name
      AND con.contype = 'f'
      AND con.connamespace = 'public'::regnamespace
-- Les manquants en premier : c'est une liste de travail, pas un inventaire.
ORDER BY present, attendu.table_name, attendu.constraint_name;

-- ── 2. Index attendus ────────────────────────────────────────────────────
SELECT
  attendu.table_name,
  attendu.index_name,
  (idx.indexname IS NOT NULL) AS present,
  attendu.migration
FROM (VALUES
  ('visits',           'visits_organization_id_incident_ack_at_idx',
   '2026-09-19-repair-incident-ack.sql'),
  ('user_invitations', 'user_invitations_token_hash_key',
   '2026-09-18-add-user-invitations.sql'),
  ('user_invitations', 'user_invitations_organization_id_idx',
   '2026-09-18-add-user-invitations.sql'),
  ('user_invitations', 'user_invitations_user_id_idx',
   '2026-09-18-add-user-invitations.sql')
) AS attendu(table_name, index_name, migration)
LEFT JOIN pg_indexes idx
       ON idx.schemaname = 'public'
      AND idx.indexname::text = attendu.index_name
ORDER BY present, attendu.table_name, attendu.index_name;

-- ── 3. Types énumérés des blocs DO antérieurs au script ──────────────────
-- Un `false` ici veut dire que le bloc DO correspondant n'est jamais passé, et
-- alors les tables qui suivaient dans le même fichier manquent aussi : c'est
-- le manque le plus grave que ce contrôle puisse révéler.
--
-- Volontairement limité aux types créés par ces trois fichiers. Les autres
-- énumérés du schéma viennent du `prisma migrate` initial et ne sont pas en
-- cause ici.
SELECT
  attendu.type_name,
  (typ.oid IS NOT NULL) AS present,
  attendu.migration
FROM (VALUES
  ('InvoiceStatus',  '2026-07-15-add-billing.sql'),
  ('AbsenceType',    '2026-08-01-add-hr-module.sql'),
  ('AbsenceStatus',  '2026-08-01-add-hr-module.sql'),
  ('ExternalSource', '2026-08-01-add-hr-module.sql')
) AS attendu(type_name, migration)
LEFT JOIN pg_type typ
       ON typ.typname::text = attendu.type_name
      AND typ.typnamespace = 'public'::regnamespace
ORDER BY present, attendu.type_name;

-- ── 4. Policies RLS : une par table porteuse d'organization_id ───────────
-- Ici la liste des tables vient de la base elle-même, et non d'une liste
-- écrite à la main : une table à organization_id ajoutée plus tard sans
-- policy doit apparaître, et elle n'apparaîtrait pas dans un VALUES qu'on
-- aurait oublié de compléter.
--
-- `isolated = false` → la table n'est pas isolée : sur le chemin applicatif
-- (rôle app_user), elle laisserait un tenant lire les lignes d'un autre.
-- C'est la vérification la plus importante de ce fichier.
--
-- Attendu : toutes les tables de tenant_tables dans rls.sql, y compris
-- contracts, work_schedules, absences (posées par un bloc DO dans
-- 2026-08-01-add-hr-module.sql) et user_invitations.
SELECT
  cls.relname AS table_name,
  cls.relrowsecurity AS rls_active,
  pol.polname AS policy_name,
  (cls.relrowsecurity AND pol.polname IS NOT NULL) AS isolated
FROM pg_class cls
JOIN pg_namespace nsp ON nsp.oid = cls.relnamespace
LEFT JOIN pg_policy pol ON pol.polrelid = cls.oid
WHERE nsp.nspname = 'public'
  AND cls.relkind = 'r'
  AND EXISTS (
    SELECT 1 FROM pg_attribute att
    WHERE att.attrelid = cls.oid
      AND att.attname = 'organization_id'
      AND att.attnum > 0
      AND NOT att.attisdropped
  )
ORDER BY isolated, cls.relname;

-- ── Que faire du résultat ────────────────────────────────────────────────
--
-- Sections 1 à 3, `present = false` : appliquer le fichier nommé dans la
-- colonne `migration`. Les deux migrations de 2026-09 passent par le script,
-- elles sont idempotentes :
--   pnpm --filter @len-len/database apply:sql prisma/sql/<fichier>.sql
--
-- Sauf pour les fichiers de la section 3 : leurs blocs DO sont hors de portée
-- du script, qui les refuse. Ceux-là demandent psql :
--   psql "$DATABASE_URL" -f prisma/sql/<fichier>.sql
--
-- Section 4, `isolated = false` : rejouer rls.sql, qui repose toutes les
-- policies et est idempotent :
--   psql "$DATABASE_URL" -f prisma/rls.sql
