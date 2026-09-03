/**
 * Anzeigename und Initialen aus der E-Mail-Adresse.
 *
 * Das Konto trägt KEINEN Namen: `AuthUser` kennt id, email, role,
 * organizationId. Der Entwurf zeigt an dieser Stelle "Sabine Krüger" – diesen
 * Namen gibt es in den Daten nicht.
 *
 * Statt einen zu erfinden wird der lokale Teil der Adresse gelesen. Das ist
 * echte Information, sie kommt vom Konto selbst, und sie trifft in der Praxis
 * fast immer (`sabine.krueger@…` -> "Sabine Krüger"). Wo sie nicht trifft
 * (`info@…`), steht dort eben "Info" und nicht ein Name, den niemand vergeben
 * hat.
 *
 * Ein Namensfeld am Konto wäre die richtige Lösung. Es fehlt heute, und diese
 * Funktion ist der Ort, der beim Nachrüsten verschwindet.
 */

/** Trennzeichen, die in E-Mail-Adressen Wortgrenzen markieren. */
const SEPARATORS = /[._+-]+/;

/**
 * Absichtlich gegen einen fehlenden Wert abgesichert, obwohl der Typ ihn
 * ausschliesst: diese Funktionen laufen im Rahmen JEDER angemeldeten Seite.
 * Ein fehlender Name ist ein Schönheitsfehler, eine Ausnahme an dieser Stelle
 * reisst die gesamte Kopfzeile samt Navigation mit – ein sehr schlechter
 * Tausch. Genau das ist beim ersten Testlauf passiert.
 */
function localPart(email: string): string {
  if (typeof email !== "string") return "";
  return email.split("@")[0] ?? "";
}

function words(email: string): string[] {
  return localPart(email)
    .split(SEPARATORS)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

/** Erster Buchstabe gross, Rest unverändert (nicht kleingeschrieben: "McLeod"). */
function capitalize(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

/**
 * Lesbarer Name für die Kopfzeile. Fällt auf die vollständige Adresse zurück,
 * wenn sich nichts gewinnen lässt – eine leere Zeile wäre schlimmer.
 */
export function displayNameFromEmail(email: string): string {
  const parts = words(email);
  if (parts.length === 0) return typeof email === "string" ? email : "";
  return parts.map(capitalize).join(" ");
}

/**
 * Vorname für die Begrüssung. Nur das erste Wort, und nur wenn es eines gibt.
 */
export function firstNameFromEmail(email: string): string | null {
  const [first] = words(email);
  return first ? capitalize(first) : null;
}

/**
 * Initialen aus einem vollständigen Namen ("Nadia Reinhardt" -> "NR").
 *
 * Nimmt das erste und das LETZTE Wort, nicht die ersten beiden: bei
 * "Anna van Dijk" ist "AD" richtig und "AV" falsch.
 */
export function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]!.charAt(0) + parts[parts.length - 1]!.charAt(0)).toUpperCase();
}

/**
 * Initialen für den Avatar. Höchstens zwei Zeichen: drei passen im Kreis von
 * 32px nicht mehr lesbar nebeneinander.
 */
export function initialsFromEmail(email: string): string {
  const parts = words(email);
  if (parts.length === 0) return typeof email === "string" ? email.slice(0, 2).toUpperCase() : "";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]!.charAt(0) + parts[1]!.charAt(0)).toUpperCase();
}
