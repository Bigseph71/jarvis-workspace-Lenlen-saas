-- Module HR (Phase 1) : contrats versionnés, plannings prévisionnels, absences.
-- Additif et idempotent. NON APPLIQUÉ à ce jour : voir la note d'application
-- des migrations dans 2026-07-04-add-pointage-gps.sql (prisma db execute ne
-- fonctionne plus, passer par $executeRawUnsafe depuis un script tsx).
--
-- Les trois tables portent external_id + external_source + updated_at, la
-- condition posée par CLAUDE.md pour brancher l'import CSV, le connecteur
-- Personio et le webhook DATEV en Phase 3 sans refactoring.

-- ── Enums ─────────────────────────────────────────────────────────────────
-- CREATE TYPE ne connaît pas IF NOT EXISTS. Le namespace fait partie du test,
-- sinon un type homonyme dans un autre schéma nous empêcherait à tort de le
-- créer dans public.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'AbsenceType' AND n.nspname = 'public'
  ) THEN
    CREATE TYPE "public"."AbsenceType" AS ENUM
      ('VACATION', 'SICK', 'TRAINING', 'PARENTAL', 'UNPAID', 'OTHER');
  END IF;

  IF NOT EXISTS (
    SELECT FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'AbsenceStatus' AND n.nspname = 'public'
  ) THEN
    CREATE TYPE "public"."AbsenceStatus" AS ENUM
      ('REQUESTED', 'APPROVED', 'REJECTED', 'CANCELED');
  END IF;

  IF NOT EXISTS (
    SELECT FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'ExternalSource' AND n.nspname = 'public'
  ) THEN
    CREATE TYPE "public"."ExternalSource" AS ENUM ('MANUAL', 'CSV', 'PERSONIO');
  END IF;
END $$;

-- ── Contrats (versionnés) ────────────────────────────────────────────────
-- valid_until NULL = contrat en cours. Le non-chevauchement par Fachkraft est
-- vérifié dans le service (hr.rules.ts), pas par une contrainte d'exclusion :
-- il doit produire un rejet ligne par ligne exploitable dans un rapport
-- d'import, pas une erreur SQL qui ferait échouer tout le lot.
CREATE TABLE IF NOT EXISTS "public"."contracts" (
  "id"              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL REFERENCES "public"."organizations"("id") ON DELETE CASCADE,
  "caregiver_id"    UUID NOT NULL REFERENCES "public"."caregivers"("id") ON DELETE CASCADE,
  "contract_type"   "public"."ContractType" NOT NULL,
  "weekly_hours"    DECIMAL(5,2) NOT NULL,
  "work_days"       JSONB NOT NULL DEFAULT '[]',
  "max_patients"    INTEGER NOT NULL DEFAULT 0,
  "valid_from"      DATE NOT NULL,
  "valid_until"     DATE,
  "external_id"     TEXT,
  "external_source" "public"."ExternalSource" NOT NULL DEFAULT 'MANUAL',
  "created_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Clé de réconciliation des imports. Postgres autorise plusieurs NULL dans un
-- index unique : les contrats saisis à la main ne se gênent jamais entre eux.
CREATE UNIQUE INDEX IF NOT EXISTS "contracts_external_key"
  ON "public"."contracts"("organization_id", "external_source", "external_id");
CREATE INDEX IF NOT EXISTS "contracts_organization_id_idx"
  ON "public"."contracts"("organization_id");
CREATE INDEX IF NOT EXISTS "contracts_org_caregiver_valid_from_idx"
  ON "public"."contracts"("organization_id", "caregiver_id", "valid_from");
-- Synchronisation incrémentale (Personio) : « tout ce qui a bougé depuis X ».
CREATE INDEX IF NOT EXISTS "contracts_org_updated_at_idx"
  ON "public"."contracts"("organization_id", "updated_at");

-- ── Plannings prévisionnels ──────────────────────────────────────────────
-- Heures en minutes depuis 00:00 (local), pas en TIME : calculable et sans
-- piège de fuseau horaire.
CREATE TABLE IF NOT EXISTS "public"."work_schedules" (
  "id"              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL REFERENCES "public"."organizations"("id") ON DELETE CASCADE,
  "caregiver_id"    UUID NOT NULL REFERENCES "public"."caregivers"("id") ON DELETE CASCADE,
  "date"            DATE NOT NULL,
  "start_minute"    INTEGER NOT NULL,
  "end_minute"      INTEGER NOT NULL,
  "break_minutes"   INTEGER NOT NULL DEFAULT 0,
  "note"            TEXT,
  "external_id"     TEXT,
  "external_source" "public"."ExternalSource" NOT NULL DEFAULT 'MANUAL',
  "created_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Clé naturelle : une vacation par Fachkraft, jour et heure de début. Rejouer
-- le même fichier CSV met à jour même sans external_id.
CREATE UNIQUE INDEX IF NOT EXISTS "work_schedules_natural_key"
  ON "public"."work_schedules"("organization_id", "caregiver_id", "date", "start_minute");
CREATE UNIQUE INDEX IF NOT EXISTS "work_schedules_external_key"
  ON "public"."work_schedules"("organization_id", "external_source", "external_id");
CREATE INDEX IF NOT EXISTS "work_schedules_organization_id_idx"
  ON "public"."work_schedules"("organization_id");
CREATE INDEX IF NOT EXISTS "work_schedules_org_date_idx"
  ON "public"."work_schedules"("organization_id", "date");
CREATE INDEX IF NOT EXISTS "work_schedules_org_updated_at_idx"
  ON "public"."work_schedules"("organization_id", "updated_at");

-- ── Absences ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "public"."absences" (
  "id"                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "organization_id"    UUID NOT NULL REFERENCES "public"."organizations"("id") ON DELETE CASCADE,
  "caregiver_id"       UUID NOT NULL REFERENCES "public"."caregivers"("id") ON DELETE CASCADE,
  "type"               "public"."AbsenceType" NOT NULL,
  "status"             "public"."AbsenceStatus" NOT NULL DEFAULT 'REQUESTED',
  "start_date"         DATE NOT NULL,
  "end_date"           DATE NOT NULL,
  "reason"             TEXT,
  "decided_by_user_id" UUID REFERENCES "public"."users"("id") ON DELETE SET NULL,
  "decided_at"         TIMESTAMP(3),
  "external_id"        TEXT,
  "external_source"    "public"."ExternalSource" NOT NULL DEFAULT 'MANUAL',
  "created_at"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "absences_external_key"
  ON "public"."absences"("organization_id", "external_source", "external_id");
CREATE INDEX IF NOT EXISTS "absences_organization_id_idx"
  ON "public"."absences"("organization_id");
CREATE INDEX IF NOT EXISTS "absences_org_caregiver_start_idx"
  ON "public"."absences"("organization_id", "caregiver_id", "start_date");
-- « Qui est absent cette semaine » : filtre statut + période.
CREATE INDEX IF NOT EXISTS "absences_org_status_start_idx"
  ON "public"."absences"("organization_id", "status", "start_date");
CREATE INDEX IF NOT EXISTS "absences_org_updated_at_idx"
  ON "public"."absences"("organization_id", "updated_at");

-- ── RLS ──────────────────────────────────────────────────────────────────
-- Isolation tenant identique aux autres tables (cf. rls.sql, où les trois
-- tables figurent désormais dans tenant_tables). Un connecteur d'intégration
-- n'est pas une exception au multi-tenant : il passe par withTenant() comme
-- le reste, et ces policies s'appliquent à lui à l'identique.
DO $$
DECLARE
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['contracts', 'work_schedules', 'absences'] LOOP
    EXECUTE format('ALTER TABLE "public".%I ENABLE ROW LEVEL SECURITY;', tbl);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON "public".%I;', tbl);
    EXECUTE format($f$
      CREATE POLICY tenant_isolation ON "public".%I
        USING (organization_id = current_setting('app.current_org', true)::uuid)
        WITH CHECK (organization_id = current_setting('app.current_org', true)::uuid);
    $f$, tbl);
  END LOOP;
END $$;
