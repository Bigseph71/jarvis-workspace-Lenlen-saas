import { MIN_TAB_HEIGHT, MIN_TOUCH_HEIGHT } from "./theme";

/**
 * Regeln der Berührungsflächen am unteren Bildschirmrand.
 *
 * WARUM DAS HIER STEHT UND NICHT IM BILDSCHIRM. Zwei Fehler derselben Art sind
 * durch die CI gegangen und erst am Gerät aufgefallen: die Reiterleiste
 * (PR #66) und die Eingabezeile des Chats (PR #74) waren auf einem Telefon mit
 * Gestensteuerung kaum zu treffen. Beide Male stand die Ursache in einer
 * StyleSheet-Zeile -- ein fester Innenabstand statt des Sicherheitsabstands des
 * Systems -- und dort kann sie niemand prüfen: der Testlauf des Mobil-Pakets
 * läuft ohne Renderer (environment: node).
 *
 * Als Funktion ist die Regel prüfbar, und zwar mit dem Werkzeug, das schon da
 * ist. Dieselbe Bewegung wie bei tour.ts, tabs.ts und history.ts: was ohne
 * React Native entscheidbar ist, wird aus dem Bildschirm herausgezogen.
 *
 * WAS DAS NICHT LEISTET, damit niemand sich darauf verlässt: geprüft wird die
 * REGEL, nicht ihre Anwendung. Schreibt jemand die Reiterleiste neu, ohne diese
 * Funktion zu rufen, bleiben die Tests grün. Sie ist deshalb die einzige Quelle
 * dieser Zahlen -- wer sie umgeht, tut es sichtbar.
 */

export interface BottomLayout {
  /** Abstand nach unten. Folgt dem Sicherheitsabstand des Systems. */
  paddingBottom: number;
  /** Kleinste Höhe der Berührungsfläche. */
  minHeight: number;
}

/**
 * Ein negativer Wert kann vom System nicht kommen, eine falsche Rechnung
 * darüber schon. Ein negativer Abstand zöge die Fläche nach unten AUS dem
 * Bild -- genau der Fehler, den diese Datei verhindern soll.
 */
function safeInset(insetBottom: number): number {
  return Number.isFinite(insetBottom) && insetBottom > 0 ? insetBottom : 0;
}

/**
 * Untere Reiterleiste.
 *
 * Der Abstand ist der Sicherheitsabstand SELBST und keine Zugabe: die Leiste
 * sitzt bündig am Rand, und nur der vom System beanspruchte Streifen bleibt
 * frei. Die Mindesthöhe (64) gilt zusätzlich, für Geräte, die gar nichts
 * beanspruchen -- dort ist der Abstand 0, und ohne sie wäre der Reiter wieder
 * so flach wie vor PR #66.
 */
export function tabBarLayout(insetBottom: number): BottomLayout {
  return { paddingBottom: safeInset(insetBottom), minHeight: MIN_TAB_HEIGHT };
}

/**
 * Eingabezeile des Chats.
 *
 * Anders als die Reiterleiste hat sie einen EIGENEN Innenabstand (12), der
 * auch ohne Systemleiste gebraucht wird: das Feld soll nicht am Rand kleben.
 * Der Sicherheitsabstand kommt oben drauf, er ersetzt ihn nicht.
 */
export const CHAT_INPUT_PADDING = 12;

export function chatInputLayout(insetBottom: number): BottomLayout {
  return {
    paddingBottom: CHAT_INPUT_PADDING + safeInset(insetBottom),
    minHeight: MIN_TOUCH_HEIGHT,
  };
}
