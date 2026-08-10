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

  // Länge der Testphase nach der Selbstregistrierung, in Tagen. Danach
  // suspendiert der Billing-Worker den Tenant, sofern kein Abo abgeschlossen
  // wurde. 0 = keine Testphase (Registrierung sofort suspendiert).
  TRIAL_PERIOD_DAYS: z.coerce.number().int().min(0).max(365).default(14),

  // Karenzzeit (Regel 8): Tage zwischen erstem fehlgeschlagenem Zahlungsversuch
  // und automatischer Suspendierung des Tenants. 0 = sofort suspendieren.
  BILLING_GRACE_PERIOD_DAYS: z.coerce.number().int().min(0).default(7),
  // Intervall des Suspendierungs-Workers (ms). Die Karenzzeit zählt in Tagen,
  // stündlich prüfen reicht daher völlig.
  BILLING_GRACE_CHECK_INTERVAL_MS: z.coerce.number().int().positive().default(3_600_000),

  // Aufbewahrungsfrist der Pflegedokumentation in Jahren, gerechnet ab dem
  // letzten Besuch. § 630f Abs. 3 BGB nennt zehn Jahre nach Abschluss der
  // Behandlung; Landesrecht oder Vertrag können mehr verlangen, deshalb
  // konfigurierbar. Bestimmt, ab wann ein Patientendatensatz auf ein
  // Löschverlangen hin anonymisiert werden darf.
  PATIENT_RETENTION_YEARS: z.coerce.number().int().min(0).max(50).default(10),

  // Zeitzone, in der Tages- und Wochengrenzen berechnet werden (IANA-Name).
  //
  // Nicht kosmetisch: davon hängen ab, welche Besuche zu "heute" gehören, in
  // welche Woche ein Besuch fällt (Regel 1 und 3) und welcher Wochentag für die
  // Arbeitstage gilt (Regel 5). In UTC gerechnet läge ein Besuch um 01:00 Uhr
  // deutscher Zeit am Vortag und am falschen Wochentag.
  //
  // Ein Wert je Instanz, keiner je Organisation: alle Tenants arbeiten heute in
  // derselben Zone. Sobald ein Tenant außerhalb liegt, gehört die Zone an die
  // Organisation.
  APP_TIME_ZONE: z
    .string()
    .default("Europe/Berlin")
    .refine((tz) => {
      try {
        new Intl.DateTimeFormat("en-US", { timeZone: tz });
        return true;
      } catch {
        return false;
      }
    }, "APP_TIME_ZONE ist kein gültiger IANA-Zeitzonenname (z.B. Europe/Berlin)"),

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
