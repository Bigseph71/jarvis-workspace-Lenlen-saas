-- Pointage GPS (Mobile-App): Position bei Ankunft/Abfahrt.
-- Additif et idempotent. Appliqué le 2026-07-04 via prisma db execute
-- (le moteur de diff Prisma est peu fiable à travers le pooler Supavisor).
ALTER TABLE "public"."visits"
  ADD COLUMN IF NOT EXISTS "gps_arrival_lat" DECIMAL(9,6),
  ADD COLUMN IF NOT EXISTS "gps_arrival_lng" DECIMAL(9,6),
  ADD COLUMN IF NOT EXISTS "gps_arrival_accuracy" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "gps_departure_lat" DECIMAL(9,6),
  ADD COLUMN IF NOT EXISTS "gps_departure_lng" DECIMAL(9,6),
  ADD COLUMN IF NOT EXISTS "gps_departure_accuracy" DOUBLE PRECISION;
