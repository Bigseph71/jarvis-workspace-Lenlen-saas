-- Echtzeit-GPS-Tracking (Phase 2) : table gps_positions.
-- Additif et idempotent. Appliqué via prisma db execute (le moteur de diff
-- Prisma est peu fiable à travers le pooler Supavisor ; cf.
-- 2026-07-04-add-pointage-gps.sql).
CREATE TABLE IF NOT EXISTS "public"."gps_positions" (
  "id"                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "organization_id"       UUID NOT NULL REFERENCES "public"."organizations"("id") ON DELETE CASCADE,
  "caregiver_id"          UUID NOT NULL REFERENCES "public"."caregivers"("id") ON DELETE CASCADE,
  "visit_id"              UUID REFERENCES "public"."visits"("id") ON DELETE SET NULL,
  "latitude"              DECIMAL(9,6) NOT NULL,
  "longitude"             DECIMAL(9,6) NOT NULL,
  "accuracy"             DOUBLE PRECISION,
  "distance_to_patient_m" DOUBLE PRECISION,
  "geofence_breach"       BOOLEAN NOT NULL DEFAULT false,
  "recorded_at"           TIMESTAMP(3) NOT NULL,
  "created_at"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "gps_positions_organization_id_idx"
  ON "public"."gps_positions"("organization_id");

-- Dernière position par Fachkraft (GET /tracking/live) : lookup ordonné desc.
CREATE INDEX IF NOT EXISTS "gps_positions_org_caregiver_recorded_idx"
  ON "public"."gps_positions"("organization_id", "caregiver_id", "recorded_at" DESC);

CREATE INDEX IF NOT EXISTS "gps_positions_visit_id_idx"
  ON "public"."gps_positions"("visit_id");

-- RLS : isolation tenant identique aux autres tables (cf. rls.sql, où
-- 'gps_positions' figure dans tenant_tables). Le cloisonnement par Fachkraft
-- (elle ne voit que sa propre position) est appliqué au niveau applicatif
-- (RBAC + scope service), au-dessus de cette isolation organisationnelle.
ALTER TABLE "public"."gps_positions" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "public"."gps_positions";
CREATE POLICY tenant_isolation ON "public"."gps_positions"
  USING (organization_id = current_setting('app.current_org', true)::uuid)
  WITH CHECK (organization_id = current_setting('app.current_org', true)::uuid);
