/**
 * Initialen für die Avatare.
 *
 * Das Konto trägt keinen Namen (AuthUser: id, email, role, …), deshalb wird
 * der lokale Teil der Adresse gelesen – dieselbe Überlegung wie im Web, siehe
 * apps/web/src/lib/display-name.ts.
 *
 * Gegen einen fehlenden Wert abgesichert, obwohl der Typ ihn ausschliesst:
 * diese Funktion steht in der Kopfzeile jedes angemeldeten Bildschirms. Ein
 * fehlender Name ist ein Schönheitsfehler, eine Ausnahme an dieser Stelle
 * nimmt der Fachkraft die ganze Tagesansicht.
 */
export function initialsFrom(value: string | null | undefined): string {
  if (typeof value !== "string" || value.length === 0) return "";

  const local = value.split("@")[0] ?? "";
  const parts = local
    .split(/[._+-]+/)
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length === 0) return value.slice(0, 2).toUpperCase();
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]!.charAt(0) + parts[parts.length - 1]!.charAt(0)).toUpperCase();
}

/** Initialen eines vollständigen Namens ("Ingrid Vogel" -> "IV"). */
export function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]!.charAt(0) + parts[parts.length - 1]!.charAt(0)).toUpperCase();
}
