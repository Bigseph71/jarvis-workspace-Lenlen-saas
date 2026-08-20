import { SubscriptionStatus } from "@len-len/database";

// Reine Logik des Panels (ohne DB, ohne Stripe) – damit unit-testbar.

/** Vorlaufzeit der Warnung "Testphase läuft ab". */
export const TRIAL_ALERT_HOURS = 48;

/**
 * Zeitfenster der ablaufenden Testphasen: von JETZT bis in 48 Stunden.
 *
 * Die Untergrenze ist bewusst `now` und nicht offen: eine bereits abgelaufene
 * Testphase ist keine Vorwarnung mehr, sondern ein Fall für den
 * Billing-Worker. Beides zu mischen hiesse, eine Liste zu bauen, die nie
 * kürzer wird.
 */
export function trialAlertWindow(now: Date, hours: number = TRIAL_ALERT_HOURS): {
  from: Date;
  to: Date;
} {
  return { from: now, to: new Date(now.getTime() + hours * 60 * 60 * 1000) };
}

/** Beginn des Tages vor `days` Tagen (für "neue Tenants" der Woche/des Monats). */
export function daysAgo(now: Date, days: number): Date {
  const d = new Date(now);
  d.setDate(d.getDate() - days);
  return d;
}

export type StatusCounts = Record<SubscriptionStatus, number>;

/**
 * Füllt die Zählung um jeden Status auf, den die Datenbank nicht geliefert hat.
 * Ohne das fehlten im Panel genau die interessanten Zeilen: ein Status ohne
 * Tenant kommt in einem GROUP BY nicht vor und verschwände aus der Anzeige,
 * statt als 0 dazustehen.
 */
export function fillStatusCounts(rows: { status: SubscriptionStatus; count: number }[]): StatusCounts {
  const counts = Object.values(SubscriptionStatus).reduce<StatusCounts>(
    (acc, status) => ({ ...acc, [status]: 0 }),
    {} as StatusCounts,
  );
  for (const row of rows) counts[row.status] = row.count;
  return counts;
}

// ── CSV ────────────────────────────────────────────────────────────────────

/**
 * Zeichen, die eine Tabellenkalkulation als Formelbeginn liest.
 *
 * Der Audit-Log enthält Werte, die Nutzer geschrieben haben (Namen, Motive,
 * Metadaten). Eine Zelle wie `=HYPERLINK(...)` oder `=cmd|'/c calc'!A1` wird
 * beim Öffnen in Excel ausgeführt, nicht angezeigt – die Datei kommt aus dem
 * eigenen Panel und niemand misstraut ihr. Deshalb ein vorangestelltes
 * Apostroph: Excel zeigt dann den Text und rechnet nicht.
 */
const FORMULA_PREFIXES = ["=", "+", "-", "@", "\t", "\r"];

/** Eine Zelle: Formeln entschärfen, dann nach RFC 4180 quoten. */
export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const raw = typeof value === "object" ? JSON.stringify(value) : String(value);
  const safe = FORMULA_PREFIXES.some((p) => raw.startsWith(p)) ? `'${raw}` : raw;
  return `"${safe.replace(/"/g, '""')}"`;
}

/**
 * Byte Order Mark. Als Escape und nicht als Zeichen im Quelltext: unsichtbar
 * eingefügt ist es später von nichts zu unterscheiden (und der Linter weist es
 * zu Recht ab).
 */
const BOM = "\uFEFF";

/** Vollständige CSV-Datei aus Kopfzeile und Zeilen (CRLF, wie RFC 4180). */
export function toCsv(headers: string[], rows: unknown[][]): string {
  const lines = [headers.map(csvCell).join(","), ...rows.map((r) => r.map(csvCell).join(","))];
  // BOM voran: sonst zeigt Excel unter Windows "Müller" als "MÃ¼ller".
  return `${BOM}${lines.join("\r\n")}\r\n`;
}
