-- Chat Fachkraft <-> Koordination (Phase 1, MVP polling).
-- Additif et idempotent. Appliqué via prisma db execute (voir note dans
-- 2026-07-04-add-pointage-gps.sql sur le moteur de diff et Supavisor).
CREATE TABLE IF NOT EXISTS "public"."messages" (
  "id"              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL REFERENCES "public"."organizations"("id") ON DELETE CASCADE,
  "caregiver_id"    UUID NOT NULL REFERENCES "public"."caregivers"("id") ON DELETE CASCADE,
  "sender_user_id"  UUID NOT NULL REFERENCES "public"."users"("id") ON DELETE CASCADE,
  "body"            TEXT NOT NULL,
  "read_at"         TIMESTAMP(3),
  "created_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "messages_organization_id_idx"
  ON "public"."messages"("organization_id");
CREATE INDEX IF NOT EXISTS "messages_organization_id_caregiver_id_created_at_idx"
  ON "public"."messages"("organization_id", "caregiver_id", "created_at");

-- RLS: même policy d'isolation tenant que les autres tables (cf. rls.sql).
ALTER TABLE "public"."messages" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "public"."messages";
CREATE POLICY tenant_isolation ON "public"."messages"
  USING (organization_id = current_setting('app.current_org', true)::uuid)
  WITH CHECK (organization_id = current_setting('app.current_org', true)::uuid);
