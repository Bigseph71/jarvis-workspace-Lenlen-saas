-- Row-Level Security (RLS) – erzwingt Tenant-Isolation auf DB-Ebene.
-- Wird nach `prisma migrate` eingespielt.
--
--   psql "$DATABASE_URL" -f prisma/rls.sql
--
-- ── Rollenmodell (wichtig) ────────────────────────────────────────────────
-- Es gibt zwei Zugriffspfade auf die DB:
--
--   1. System-/Auth-Pfad  -> verbindet als Tabellen-EIGENTÜMER.
--      Der Eigentümer UMGEHT RLS (solange nicht FORCE gesetzt ist). Nötig für:
--        - Login (E-Mail-Lookup VOR bekanntem Tenant)
--        - Refresh-Token-Lookup
--        - Organisation-Bootstrap (Tenant existiert noch nicht)
--        - Migrationen
--
--   2. Anwendungs-/Tenant-Pfad -> verbindet als NICHT-Eigentümer-Rolle
--      `app_user` (KEIN BYPASSRLS). Unterliegt RLS vollständig. Die App setzt
--      pro Operation `app.current_org` via withTenant() (siehe src/index.ts).
--
-- In der Dev-Umgebung verbindet sich alles als Eigentümer; die RLS-Policies
-- sind dort Verteidigung in der Tiefe und werden für app_user scharf.
-- Deshalb KEIN "FORCE ROW LEVEL SECURITY" – das würde den System-Pfad brechen.

-- ── Optional: dedizierte App-Rolle (in Prod empfohlen) ────────────────────
-- DO $$
-- BEGIN
--   IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_user') THEN
--     CREATE ROLE app_user LOGIN PASSWORD 'change_me';
--   END IF;
-- END $$;
-- GRANT USAGE ON SCHEMA public TO app_user;
-- GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_user;
-- ALTER DEFAULT PRIVILEGES IN SCHEMA public
--   GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_user;

-- ── Policies auf tenant-gebundenen Tabellen ───────────────────────────────
DO $$
DECLARE
  tbl text;
  tenant_tables text[] := ARRAY[
    'users', 'caregivers', 'patients', 'visits',
    'vehicles', 'routes', 'audit_logs'
  ];
BEGIN
  FOREACH tbl IN ARRAY tenant_tables LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', tbl);

    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I;', tbl);

    EXECUTE format($f$
      CREATE POLICY tenant_isolation ON %I
        USING (organization_id = current_setting('app.current_org', true)::uuid)
        WITH CHECK (organization_id = current_setting('app.current_org', true)::uuid);
    $f$, tbl);
  END LOOP;
END $$;

-- organizations: nur die eigene Zeile sichtbar (System-Pfad/Eigentümer umgeht).
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_self ON organizations;
CREATE POLICY tenant_self ON organizations
  USING (id = current_setting('app.current_org', true)::uuid)
  WITH CHECK (id = current_setting('app.current_org', true)::uuid);
