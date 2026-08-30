-- Kenntnisnahme gemeldeter Vorfälle durch die Koordination.
-- Additif et idempotent.
--
--     pnpm --filter @len-len/database apply:sql prisma/sql/2026-08-30-add-incident-ack.sql
--
-- À APPLIQUER AVANT de déployer le code qui en dépend, comme
-- 2026-08-30-add-visit-notes.sql : le client Prisma sélectionne ces colonnes
-- explicitement dans la liste des visites.
--
-- Pourquoi un accusé de réception plutôt qu'une simple bannière : sans lui, un
-- incident signalé resterait affiché tant que has_incident vaut true, sans
-- moyen de le clore. Une alerte qu'on ne peut pas fermer finit ignorée.

ALTER TABLE "public"."visits"
  ADD COLUMN IF NOT EXISTS "incident_ack_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "incident_ack_by_user_id" UUID;

-- ON DELETE SET NULL, comme absences.decided_by_user_id : le départ d'un
-- coordinateur ne doit pas empêcher la suppression de son compte, et le fait
-- que l'incident a été pris en compte reste porté par l'audit log.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'visits_incident_ack_by_user_id_fkey'
  ) THEN
    ALTER TABLE "public"."visits"
      ADD CONSTRAINT "visits_incident_ack_by_user_id_fkey"
      FOREIGN KEY ("incident_ack_by_user_id") REFERENCES "public"."users"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- La liste d'alerte demande les incidents ouverts d'une organisation.
CREATE INDEX IF NOT EXISTS "visits_organization_id_incident_ack_at_idx"
  ON "public"."visits" ("organization_id", "incident_ack_at");

-- Contrôle après application :
--   SELECT column_name, data_type
--     FROM information_schema.columns
--    WHERE table_name = 'visits'
--      AND column_name IN ('incident_ack_at', 'incident_ack_by_user_id');
-- Deux lignes attendues.
--
-- Aucune donnée existante à reprendre : les visites déjà marquées d'un incident
-- démarrent non acquittées, ce qui est l'état correct — personne ne les a
-- encore vues.
