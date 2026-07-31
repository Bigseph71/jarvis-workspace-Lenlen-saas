-- Pointage GPS (Mobile-App): Position bei Ankunft/Abfahrt.
-- Additif et idempotent. Appliqué le 2026-07-04 via prisma db execute.
--
-- ─── Note d'application des migrations de ce dossier ──────────────────────
-- (fichier de référence : les autres migrations renvoient ici)
--
-- Ces fichiers sont écrits à la main et appliqués manuellement, parce que le
-- moteur de diff de Prisma (prisma migrate) est peu fiable à travers le pooler
-- Supabase Supavisor.
--
-- ATTENTION : `prisma db execute` a servi jusqu'en juillet 2026 mais NE
-- FONCTIONNE PLUS. Constaté le 2026-07-31 : la commande reste bloquée jusqu'au
-- timeout sur la DATABASE_URL du projet (Supavisor, port 6543, mode
-- transaction). La connexion elle-même est saine, les lectures passent
-- normalement — c'est bien db execute qui bloque.
--
-- Méthode qui fonctionne aujourd'hui : exécuter le contenu du fichier via le
-- client Prisma depuis un script tsx,
--
--     await prisma.$executeRawUnsafe(sql)   // commentaires "--" retirés
--
-- puis vérifier le résultat dans information_schema.columns. La connexion
-- directe (port 5432 au lieu du pooler) devrait également convenir, non testée.
--
-- Le CI ne joue aucune migration : rien n'alerte si l'une manque sur un
-- environnement. À appliquer sur chaque base AVANT de déployer le code qui en
-- dépend.
-- ──────────────────────────────────────────────────────────────────────────
ALTER TABLE "public"."visits"
  ADD COLUMN IF NOT EXISTS "gps_arrival_lat" DECIMAL(9,6),
  ADD COLUMN IF NOT EXISTS "gps_arrival_lng" DECIMAL(9,6),
  ADD COLUMN IF NOT EXISTS "gps_arrival_accuracy" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "gps_departure_lat" DECIMAL(9,6),
  ADD COLUMN IF NOT EXISTS "gps_departure_lng" DECIMAL(9,6),
  ADD COLUMN IF NOT EXISTS "gps_departure_accuracy" DOUBLE PRECISION;
