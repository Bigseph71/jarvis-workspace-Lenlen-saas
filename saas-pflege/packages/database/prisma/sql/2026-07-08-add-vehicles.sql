-- Modul Leasing (Phase 2) : table vehicles.
-- Additif et idempotent. Appliqué via prisma db execute (voir note dans
-- 2026-07-04-add-pointage-gps.sql sur le moteur de diff et Supavisor).
CREATE TABLE IF NOT EXISTS "public"."vehicles" (
  "id"               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "organization_id"  UUID NOT NULL REFERENCES "public"."organizations"("id") ON DELETE CASCADE,
  "label"            TEXT NOT NULL,
  "leasing_km_limit" INTEGER NOT NULL,
  "leasing_km_used"  INTEGER NOT NULL DEFAULT 0,
  "leasing_end_date" DATE,
  "is_active"        BOOLEAN NOT NULL DEFAULT true,
  "created_at"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "vehicles_organization_id_idx"
  ON "public"."vehicles"("organization_id");

-- RLS : même isolation tenant que les autres tables (cf. rls.sql, où 'vehicles'
-- figure déjà dans tenant_tables).
ALTER TABLE "public"."vehicles" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "public"."vehicles";
CREATE POLICY tenant_isolation ON "public"."vehicles"
  USING (organization_id = current_setting('app.current_org', true)::uuid)
  WITH CHECK (organization_id = current_setting('app.current_org', true)::uuid);
