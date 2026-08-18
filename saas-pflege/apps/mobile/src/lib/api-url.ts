/**
 * Auflösung der API-Adresse – bewusst ohne Abhängigkeiten, damit sie ohne
 * React Native geprüft werden kann.
 *
 * `EXPO_PUBLIC_API_URL` wird beim Bündeln eingesetzt, nicht beim Start gelesen.
 * Fehlt der Wert, half vorher ein stiller Rückfall auf `http://localhost:4000`
 * – auf einem Telefon ist das das Telefon selbst. Die App liess sich also
 * installieren, zeigte die Anmeldung und lief in Zeitüberschreitungen, ohne
 * irgendwo zu sagen, warum. Genau dieser Fehler ist dem Web schon einmal
 * passiert (apps/web/next.config.mjs lässt den Build seitdem scheitern).
 *
 * Deshalb: in der Entwicklung bleibt der Rückfall, in einem Release-Build wird
 * das Fehlen zum harten Fehler. Eine App, die niemanden erreichen kann, soll
 * es sofort sagen und nicht so tun, als arbeitete sie.
 */

/** Rückfall für `expo start` ohne eigene .env (Simulator/Emulator). */
export const DEV_FALLBACK_API_URL = "http://localhost:4000";

export interface ApiUrlOptions {
  /** Wert von process.env.EXPO_PUBLIC_API_URL zum Zeitpunkt des Bündelns. */
  configured: string | undefined;
  /** __DEV__ von React Native: false in jedem Release-Build. */
  isDev: boolean;
}

export function resolveApiBaseUrl({ configured, isDev }: ApiUrlOptions): string {
  const trimmed = configured?.trim();
  if (trimmed) return trimmed;

  if (!isDev) {
    throw new Error(
      "EXPO_PUBLIC_API_URL fehlt in diesem Build. Der Wert wird beim Bündeln " +
        "eingesetzt und muss im EAS-Profil (eas.json) stehen – ohne ihn " +
        "erreicht die App kein Backend.",
    );
  }

  return DEV_FALLBACK_API_URL;
}
