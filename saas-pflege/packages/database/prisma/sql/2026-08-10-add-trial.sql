-- ─────────────────────────────────────────────────────────────────────────
--  Testphase nach der Selbstregistrierung
-- ─────────────────────────────────────────────────────────────────────────
-- Bisher startete jede neue Organisation auf ACTIVE/BASIC – ohne Abo und ohne
-- Ende. Solange niemand sich selbst registrieren konnte, fiel das nicht auf;
-- mit der oeffentlichen Registrierung waere daraus ein unbefristeter
-- Gratis-Tarif geworden.
--
-- TRIAL ist ein eigener Status und nicht bloss ein Datum neben ACTIVE: die
-- Limit-Pruefung, der Suspendierungs-Sweep und die Abrechnungsansicht muessen
-- eine Testphase von einem bezahlten Abo unterscheiden koennen.

-- ALTER TYPE ... ADD VALUE laeuft in einer EIGENEN Transaktion. Der neue Wert
-- ist innerhalb derselben Transaktion nicht benutzbar; deshalb steht diese
-- Anweisung allein und die Spalte folgt getrennt.
ALTER TYPE "public"."SubscriptionStatus" ADD VALUE IF NOT EXISTS 'TRIAL' BEFORE 'ACTIVE';

ALTER TABLE "public"."organizations"
  ADD COLUMN IF NOT EXISTS "trial_ends_at" TIMESTAMP(3);

-- Faellige Testphasen finden. Teilindex: nur laufende Tests sind relevant,
-- und das ist eine kleine Minderheit der Zeilen.
CREATE INDEX IF NOT EXISTS "organizations_trial_ends_at_idx"
  ON "public"."organizations"("trial_ends_at")
  WHERE "trial_ends_at" IS NOT NULL;
