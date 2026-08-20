/**
 * Anzeige der laufenden App-Version – reine Formatierung, ohne Expo-Module,
 * damit sie ohne React Native prüfbar bleibt.
 *
 * Wozu: alle bisherigen Builds trugen `0.1.0` und `versionCode` 1. Meldet eine
 * Fachkraft am Telefon einen Fehler, liess sich nicht feststellen, welchen
 * Stand sie überhaupt installiert hat – und ob der Fehler längst behoben ist.
 * Die Build-Nummer beantwortet genau das, deshalb steht sie sichtbar auf dem
 * Anmeldebildschirm: dort kommt man ohne Konto hin, was den Fall abdeckt, in
 * dem sich jemand gar nicht erst anmelden kann.
 *
 * Gelesen wird sie aus dem NATIVEN Paket (expo-application), nicht aus der
 * JS-Konfiguration: EAS vergibt die Build-Nummer serverseitig
 * (`appVersionSource: "remote"`), sie steht also gar nicht in app.json. Nur der
 * native Wert entspricht dem, was auf dem Gerät liegt.
 */

export interface AppVersionParts {
  /** z.B. "0.1.0" – nativeApplicationVersion */
  version: string | null;
  /** Android: versionCode, iOS: build number – nativeBuildVersion */
  build: string | null;
}

/**
 * "0.1.0 (7)", oder "0.1.0" wenn die Build-Nummer fehlt.
 * Fehlt beides (Expo Go, Web), wird nichts angezeigt: eine leere Zeichenkette
 * ist ehrlicher als ein Platzhalter, der nach einer Version aussieht.
 */
export function formatAppVersion({ version, build }: AppVersionParts): string {
  const v = version?.trim();
  const b = build?.trim();

  if (!v) return "";
  return b ? `${v} (${b})` : v;
}
