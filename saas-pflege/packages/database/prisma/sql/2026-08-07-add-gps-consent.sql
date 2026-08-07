-- ─────────────────────────────────────────────────────────────────────────
--  Einwilligung in die GPS-Erfassung (DSGVO Art. 6/7, § 26 BDSG)
-- ─────────────────────────────────────────────────────────────────────────
-- Bis hierher schrieb /tracking/position Standortdaten von Beschäftigten,
-- ohne dass irgendwo festgehalten war, ob eingewilligt wurde. Diese Tabelle
-- schliesst die Lücke und traegt ab sofort die Pruefung bei jedem Ingest.
--
-- Append-only: ein Widerruf setzt revoked_at, er loescht nichts. Art. 7 Abs. 1
-- verlangt den NACHWEIS der Einwilligung; ein ueberschriebener Datensatz
-- koennte fuer einen vergangenen Zeitpunkt nichts mehr belegen.

CREATE TABLE IF NOT EXISTS "public"."gps_consents" (
  "id"              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL REFERENCES "public"."organizations"("id") ON DELETE CASCADE,
  "caregiver_id"    UUID NOT NULL REFERENCES "public"."caregivers"("id") ON DELETE CASCADE,
  -- Version des Einwilligungstextes. Eine Einwilligung deckt immer nur den
  -- Text, der ihr vorlag; aendert er sich, muss neu eingewilligt werden.
  "policy_version"  TEXT NOT NULL,
  "locale"          "public"."Locale" NOT NULL DEFAULT 'DE',
  "granted_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  -- NULL = wirksam. Gesetzt = widerrufen (Art. 7 Abs. 3: wirkt nur fuer die
  -- Zukunft, bereits erfasste Punkte bleiben rechtmaessig erhoben).
  "revoked_at"      TIMESTAMP(3),
  "created_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Traegt die Pruefung bei JEDEM Positions-Ingest (alle 30 s je Fachkraft):
-- juengste Zeile je Fachkraft, deshalb granted_at absteigend im Index.
CREATE INDEX IF NOT EXISTS "gps_consents_org_caregiver_granted_idx"
  ON "public"."gps_consents"("organization_id", "caregiver_id", "granted_at" DESC);

-- RLS: Tenant-Isolation wie bei allen uebrigen Tabellen (siehe rls.sql, wo
-- 'gps_consents' in tenant_tables gefuehrt wird).
ALTER TABLE "public"."gps_consents" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "public"."gps_consents";
CREATE POLICY tenant_isolation ON "public"."gps_consents"
  USING (organization_id = current_setting('app.current_org', true)::uuid)
  WITH CHECK (organization_id = current_setting('app.current_org', true)::uuid);
