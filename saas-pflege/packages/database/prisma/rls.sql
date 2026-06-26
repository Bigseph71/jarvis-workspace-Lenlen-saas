-- Row-Level Security (RLS) – erzwingt Tenant-Isolation auf DB-Ebene.
-- Wird nach `prisma migrate` eingespielt. Die App setzt pro Request:
--   SET LOCAL app.current_org = '<organization_id>';
-- und verbindet sich mit einer Rolle, die BYPASSRLS NICHT besitzt.
--
-- Einspielen (dev):  psql "$DATABASE_URL" -f prisma/rls.sql

-- Tenant-gebundene Tabellen
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
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY;', tbl);

    EXECUTE format($f$
      DROP POLICY IF EXISTS tenant_isolation ON %I;
    $f$, tbl);

    EXECUTE format($f$
      CREATE POLICY tenant_isolation ON %I
        USING (organization_id = current_setting('app.current_org', true)::uuid)
        WITH CHECK (organization_id = current_setting('app.current_org', true)::uuid);
    $f$, tbl);
  END LOOP;
END $$;

-- organizations: nur die eigene Zeile sichtbar (Super-Admin umgeht via separater Rolle)
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE organizations FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_self ON organizations;
CREATE POLICY tenant_self ON organizations
  USING (id = current_setting('app.current_org', true)::uuid)
  WITH CHECK (id = current_setting('app.current_org', true)::uuid);
