/**
 * Reiterleiste der App: welche Reiter es gibt, und WIE ein Wechsel navigiert.
 *
 * Die App hat keinen Tab-Navigator, sondern einen Stack (app/_layout.tsx). Die
 * Leiste ist damit nur eine Optik – die Stapel-Semantik muss von Hand richtig
 * gesetzt werden, sonst wächst der Stapel bei jedem Wechsel um einen Eintrag
 * und die Zurück-Taste des Telefons blättert durch eine Kette von Reitern
 * statt die App zu verlassen.
 *
 * Als reine Funktion herausgezogen, weil genau das der Teil ist, der still
 * falsch sein kann: auf dem Telefon sieht ein zu tiefer Stapel exakt so aus
 * wie ein richtiger, bis jemand auf Zurück drückt.
 */

export type TabKey = "tour" | "chat" | "history";

/** Reihenfolge der Leiste. Der Verlauf ist der DRITTE Reiter. */
export const TAB_ORDER: readonly TabKey[] = ["tour", "chat", "history"];

export const TAB_HREF: Record<TabKey, string> = {
  tour: "/today",
  chat: "/chat",
  history: "/history",
};

export type TabNavigation =
  | { kind: "none" }
  | { kind: "dismissTo"; href: string }
  | { kind: "push"; href: string }
  | { kind: "replace"; href: string };

/**
 * Wie von `active` nach `target` gewechselt wird.
 *
 * Die Tagesroute ist die Wurzel, Chat und Verlauf sind Blätter darüber:
 *
 *   - auf sich selbst: gar nichts. Ein erneutes Antippen des aktiven Reiters
 *     darf keine zweite Kopie desselben Bildschirms aufmachen;
 *   - zur Tour: `dismissTo`. Räumt den Stapel bis zur Tagesroute ab, und legt
 *     sie an die Stelle des aktuellen Bildschirms, falls sie nicht darin liegt
 *     (Deep Link direkt auf /history);
 *   - von der Tour weg: `push`. Der Chat-Bildschirm hat eine Zurück-Taste, die
 *     auf die Tour führen soll – dafür muss sie im Stapel bleiben;
 *   - zwischen zwei Blättern: `replace`. Sonst läge unter dem Chat der Verlauf
 *     und darunter die Tour, und die Zurück-Taste liefe rückwärts durch die
 *     Reiterleiste.
 */
export function tabNavigation(active: TabKey, target: TabKey): TabNavigation {
  if (active === target) return { kind: "none" };
  const href = TAB_HREF[target];
  if (target === "tour") return { kind: "dismissTo", href };
  if (active === "tour") return { kind: "push", href };
  return { kind: "replace", href };
}
