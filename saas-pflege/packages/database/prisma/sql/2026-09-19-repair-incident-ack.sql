-- Rattrapage : la clé étrangère et l'index de 2026-08-30-add-incident-ack.sql.
-- Additif et idempotent.
--
--     pnpm --filter @len-len/database apply:sql prisma/sql/2026-09-19-repair-incident-ack.sql
--
-- À N'APPLIQUER QUE SI le contrôle le demande. Lancer d'abord les sections 1
-- et 2 de CONTROLE-etat-schema.sql : si « visits_incident_ack_by_user_id_fkey »
-- et « visits_organization_id_incident_ack_at_idx » sont là, ce fichier n'a
-- rien à faire.
--
-- POURQUOI
--
-- 2026-08-30-add-incident-ack.sql pose sa clé étrangère dans un bloc
-- « DO $$ ... END $$; ». Le script apply:sql découpe sur « ; » : le bloc part
-- en morceaux invalides et le script s'arrête là. Les colonnes, qui précèdent,
-- sont en place ; la clé étrangère et l'index, qui suivent, ne le sont pas.
--
-- Rien ne le signalait. L'application marche sans : Prisma gère la relation
-- côté applicatif, et la liste d'alertes reste correcte, seulement plus lente.
-- Ce qui manque est la garantie d'intégrité — supprimer un coordinateur ayant
-- acquitté un incident laisse une référence morte au lieu de passer la colonne
-- à NULL, ce qui est précisément la raison d'être du ON DELETE SET NULL.
--
-- Depuis, apply:sql refuse les fichiers à bloc PL/pgSQL avant d'exécuter quoi
-- que ce soit, plutôt que de s'arrêter à mi-parcours.
--
-- CE QUE COÛTE LE DROP PUIS ADD
--
-- Impossible de poser une contrainte conditionnellement sans PL/pgSQL, donc
-- DROP IF EXISTS puis ADD : idempotent en deux instructions élémentaires. Si
-- la contrainte était déjà là, le ADD revalide toute la table visits sous un
-- verrou exclusif. Sur la volumétrie actuelle c'est l'affaire d'un instant ;
-- sur une base devenue grosse, préférer le bloc conditionnel d'origine joué
-- avec psql.

ALTER TABLE "public"."visits"
  DROP CONSTRAINT IF EXISTS "visits_incident_ack_by_user_id_fkey";

-- ON DELETE SET NULL, comme absences.decided_by_user_id : le départ d'un
-- coordinateur ne doit pas empêcher la suppression de son compte, et le fait
-- que l'incident a été pris en compte reste porté par l'audit log.
ALTER TABLE "public"."visits"
  ADD CONSTRAINT "visits_incident_ack_by_user_id_fkey"
  FOREIGN KEY ("incident_ack_by_user_id") REFERENCES "public"."users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- La liste d'alerte demande les incidents ouverts d'une organisation.
CREATE INDEX IF NOT EXISTS "visits_organization_id_incident_ack_at_idx"
  ON "public"."visits" ("organization_id", "incident_ack_at");

-- Contrôle après application :
--   SELECT conname FROM pg_constraint
--    WHERE conrelid = 'public.visits'::regclass AND contype = 'f';
--
--   SELECT indexname FROM pg_indexes
--    WHERE tablename = 'visits';
