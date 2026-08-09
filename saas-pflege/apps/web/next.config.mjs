import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

/**
 * NEXT_PUBLIC_API_URL ist im Produktions-Build PFLICHT.
 *
 * Next ersetzt `process.env.NEXT_PUBLIC_*` zur BAUZEIT durch den Literalwert –
 * die Variable wird zur Laufzeit nie gelesen. Fehlt sie beim Bauen, greift der
 * Rückfall aus api-setup.ts und `http://localhost:4000` steht fest im Bundle.
 * Das Ergebnis ist eine ausgelieferte App, die den Rechner des Besuchers
 * anspricht: der Browser meldet dann einen CORS-Fehler gegen localhost, und
 * gesucht wird an der völlig falschen Stelle.
 *
 * Genau das ist beim ersten Deployment passiert. Deshalb bricht der Build hier
 * ab, statt ein kaputtes Artefakt zu erzeugen.
 *
 * In der Entwicklung (`next dev`) bleibt der Rückfall erlaubt: dort IST das
 * Backend auf localhost:4000.
 *
 * Erkannt wird der BEFEHL, nicht die Umgebung. `next lint` lädt diese Datei
 * ebenfalls, setzt dabei NODE_ENV auf "production" UND meldet die Phase
 * `phase-production-build` – beide Signale sind hier also wertlos und ließen
 * das Linten scheitern, obwohl kein Bundle entsteht. Nur `process.argv`
 * unterscheidet die beiden Aufrufe zuverlässig (nachgemessen).
 */
function assertApiUrl() {
  if (process.env.NEXT_PUBLIC_API_URL) return;
  throw new Error(
    [
      "NEXT_PUBLIC_API_URL fehlt im Produktions-Build.",
      "",
      "Next friert diese Variable beim Bauen ein; ohne sie landet",
      '"http://localhost:4000" fest im ausgelieferten Bundle und die App',
      "spricht den Rechner des Besuchers an statt des Backends.",
      "",
      "Setzen auf die öffentliche URL der API, zum Beispiel:",
      "  NEXT_PUBLIC_API_URL=https://<backend>.up.railway.app",
      "",
      "Danach NEU BAUEN – ein Neustart genügt nicht, der Wert steckt im Bundle.",
    ].join("\n"),
  );
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  reactStrictMode: true,
  // Workspace-Pakete werden als TypeScript-Quellcode konsumiert.
  transpilePackages: ["@len-len/api-client"],
};

// `next build` -> ["…/next", "build"] ; `next lint` -> ["…/next", "lint"].
if (process.argv[2] === "build") assertApiUrl();

export default withNextIntl(nextConfig);
