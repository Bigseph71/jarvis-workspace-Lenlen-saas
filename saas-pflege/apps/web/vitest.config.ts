import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

/**
 * Komponententests des Webs.
 *
 * Bewusst Vitest und nicht Playwright: die Fehler, die hier zuletzt
 * durchgerutscht sind – ein gesperrter Basic-Knopf, eine Startseite ohne
 * Ausgang – liegen in der Render-Logik, nicht im Zusammenspiel mit einem
 * echten Backend. Sie sind ohne Browser und ohne laufenden Server prüfbar,
 * laufen in Sekunden und passen in dieselbe CI-Stufe wie die Backend-Tests.
 *
 * Ein End-to-End-Werkzeug bleibt sinnvoll für den Bezahlvorgang, der über
 * Stripe hinausführt. Das ist ein eigener Ausbau.
 */
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./test/setup.ts"],
    include: ["test/**/*.test.tsx", "test/**/*.test.ts"],
  },
});
