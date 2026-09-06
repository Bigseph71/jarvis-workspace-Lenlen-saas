/**
 * Kurzform des ausgelieferten Commits, für /health.
 *
 * Bewusst eine eigene Kopie und kein geteiltes Paket: das Gegenstück im
 * Backend (`lib/health.ts: shortCommit`) ist dieselben drei Zeilen. Ein
 * Workspace-Paket dafür anzulegen hiesse, Web und Backend an einer Stelle
 * aneinander zu binden, an der sie nichts voneinander wissen müssen – und
 * dieses Paket zöge der Next-Build mit in sein Bundle.
 */

/**
 * Sieben Zeichen des Commits – dieselbe Kurzform, die `git log --oneline`
 * zeigt, also direkt mit dem Verlauf vergleichbar.
 *
 * `unknown`, wenn der Hoster nichts liefert (lokal, in Tests). Ein leeres Feld
 * wäre schlimmer als ein ehrliches "unknown": es sähe aus wie eine Version.
 */
export function shortCommit(sha: string | undefined): string {
  const trimmed = sha?.trim();
  return trimmed ? trimmed.slice(0, 7) : "unknown";
}

/**
 * Der Commit dieses Builds.
 *
 * Zwei Quellen, in dieser Reihenfolge: `GIT_COMMIT_SHA` für den Fall, dass
 * jemand den Wert von Hand setzt (anderer Hoster, lokaler Container), sonst
 * `RAILWAY_GIT_COMMIT_SHA`, das Railway selbst mitgibt. Dieselbe Reihenfolge
 * wie im Backend, damit beide Dienste dieselbe Antwort auf dieselbe Frage geben.
 */
export function deployedCommit(): string {
  // `??` reicht hier NICHT: eine im Hoster angelegte, aber leer gelassene
  // Variable ist "" und nicht undefined - der Ausdruck bliebe bei ihr stehen,
  // und /health meldete auf Dauer "unknown", obwohl Railway den Commit direkt
  // daneben mitliefert. Leer zaehlt deshalb wie nicht gesetzt.
  const candidates = [process.env.GIT_COMMIT_SHA, process.env.RAILWAY_GIT_COMMIT_SHA];
  return shortCommit(candidates.find((value) => value?.trim()));
}
