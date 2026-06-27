import { z } from "zod";

// Validierung der Umgebungsvariablen beim Start. Fehlt etwas, crasht der
// Prozess sofort mit klarer Meldung (fail-fast) statt später undefiniert.
const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  BACKEND_PORT: z.coerce.number().int().positive().default(4000),

  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().default("redis://localhost:6379"),

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

  NEXT_PUBLIC_API_URL: z.string().optional(),

  // Ursprung (Origin) des Web-Frontends – für CORS. NICHT die API-URL.
  WEB_ORIGIN: z.string().default("http://localhost:3000"),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error("Ungültige Umgebungskonfiguration:", parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
