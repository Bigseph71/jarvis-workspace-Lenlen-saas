-- Stripe-Billing (Phase 2) : Karenzzeit, Rechnungs-Historie, Webhook-Idempotenz.
-- Additif et idempotent. Appliqué via prisma db execute (le moteur de diff
-- Prisma est peu fiable à travers le pooler Supavisor ; cf.
-- 2026-07-04-add-pointage-gps.sql).

-- ── Karenzzeit (Regel 8) ─────────────────────────────────────────────────
-- Début de la période de grâce : posé au premier échec de paiement, effacé au
-- retour au paiement. Le worker suspend le tenant une fois le délai écoulé.
ALTER TABLE "public"."organizations"
  ADD COLUMN IF NOT EXISTS "past_due_since" TIMESTAMP(3);

-- Balayage du worker : ne remonter que les tenants réellement en retard.
CREATE INDEX IF NOT EXISTS "organizations_past_due_since_idx"
  ON "public"."organizations"("past_due_since")
  WHERE "past_due_since" IS NOT NULL;

-- ── Rechnungs-Historie ───────────────────────────────────────────────────
-- Enum idempotent anlegen (CREATE TYPE kennt kein IF NOT EXISTS). Der Namespace
-- gehört in die Prüfung, sonst hielte ein gleichnamiger Typ in einem anderen
-- Schema uns fälschlich davon ab, ihn in `public` anzulegen.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'InvoiceStatus' AND n.nspname = 'public'
  ) THEN
    CREATE TYPE "public"."InvoiceStatus" AS ENUM ('PAID', 'OPEN', 'FAILED', 'VOID');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "public"."invoices" (
  "id"                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "organization_id"    UUID NOT NULL REFERENCES "public"."organizations"("id") ON DELETE CASCADE,
  "stripe_invoice_id"  TEXT NOT NULL UNIQUE,
  "number"             TEXT,
  -- Montants en centimes, tels que fournis par Stripe.
  "amount_due"         INTEGER NOT NULL,
  "amount_paid"        INTEGER NOT NULL DEFAULT 0,
  "currency"           TEXT NOT NULL DEFAULT 'eur',
  "status"             "public"."InvoiceStatus" NOT NULL,
  "hosted_invoice_url" TEXT,
  "invoice_pdf_url"    TEXT,
  "issued_at"          TIMESTAMP(3) NOT NULL,
  "created_at"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Historique affiché du plus récent au plus ancien (GET /billing/invoices).
CREATE INDEX IF NOT EXISTS "invoices_organization_id_issued_at_idx"
  ON "public"."invoices"("organization_id", "issued_at");

-- RLS : isolation tenant identique aux autres tables (cf. rls.sql, où
-- 'invoices' figure dans tenant_tables).
ALTER TABLE "public"."invoices" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "public"."invoices";
CREATE POLICY tenant_isolation ON "public"."invoices"
  USING (organization_id = current_setting('app.current_org', true)::uuid)
  WITH CHECK (organization_id = current_setting('app.current_org', true)::uuid);

-- ── Webhook-Idempotenz ───────────────────────────────────────────────────
-- Stripe livre ses events at-least-once. L'id d'event en clé primaire sert de
-- verrou : un insert en conflit signifie « déjà traité ».
-- Table système sans organization_id -> pas de RLS (seul le chemin système y
-- écrit, le webhook n'a pas de contexte tenant).
CREATE TABLE IF NOT EXISTS "public"."billing_webhook_events" (
  "id"           TEXT PRIMARY KEY,
  "type"         TEXT NOT NULL,
  "processed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Purge des vieux events (rétention) : balayage par date.
CREATE INDEX IF NOT EXISTS "billing_webhook_events_processed_at_idx"
  ON "public"."billing_webhook_events"("processed_at");
