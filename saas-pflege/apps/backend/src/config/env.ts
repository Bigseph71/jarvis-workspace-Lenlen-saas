import { z } from "zod";

// Validierung der Umgebungsvariablen beim Start. Fehlt etwas, crasht der
// Prozess sofort mit klarer Meldung (fail-fast) statt später undefiniert.
const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  BACKEND_PORT: z.coerce.number().int().positive().default(4000),

  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().default("redis://localhost:6379"),

  // Sicherheits-Timeout des VRPTW-Solvers (ms). Nach Ablauf wird eine
  // Teil-Lösung zurückgegeben statt abzubrechen (CLAUDE.md: 30 s, konfigurierbar).
  VRPTW_TIMEOUT_MS: z.coerce.number().int().positive().default(30000),

  // Pflicht-Secrets. In Prod lange Zufallswerte verwenden.
  JWT_ACCESS_SECRET: z.string().min(16, "JWT_ACCESS_SECRET muss >= 16 Zeichen sein"),
  JWT_REFRESH_SECRET: z.string().min(16, "JWT_REFRESH_SECRET muss >= 16 Zeichen sein"),

  // TTLs als Dauer-Strings (z.B. "15m", "7d").
  JWT_ACCESS_TTL: z.string().default("15m"),
  JWT_REFRESH_TTL: z.string().default("7d"),

  // Ohne Key fällt Geocoding auf den Stub-Provider zurück.
  GOOGLE_MAPS_API_KEY: z.string().optional(),

  // Ohne Stripe-Keys läuft Billing im Stub-Modus.
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  STRIPE_PRICE_BASIC: z.string().optional(),
  STRIPE_PRICE_PRO: z.string().optional(),
  STRIPE_PRICE_ENTERPRISE: z.string().optional(),

  // Karenzzeit (Regel 8): Tage zwischen erstem fehlgeschlagenem Zahlungsversuch
  // und automatischer Suspendierung des Tenants. 0 = sofort suspendieren.
  BILLING_GRACE_PERIOD_DAYS: z.coerce.number().int().min(0).default(7),
  // Intervall des Suspendierungs-Workers (ms). Die Karenzzeit zählt in Tagen,
  // stündlich prüfen reicht daher völlig.
  BILLING_GRACE_CHECK_INTERVAL_MS: z.coerce.number().int().positive().default(3_600_000),

  // Ursprung (Origin) des Web-Frontends – für CORS und für die Rückkehr-URLs
  // aus Stripe (Checkout/Portal führen nach /{locale}/billing zurück).
  // NICHT die API-URL: NEXT_PUBLIC_API_URL gehört dem Web und wird dort direkt
  // aus process.env gelesen.
  WEB_ORIGIN: z.string().default("http://localhost:3000"),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error("Ungültige Umgebungskonfiguration:", parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
