import { defineConfig } from "vitest/config";

/**
 * Erste Testeinrichtung der mobilen App.
 *
 * Bewusst schmal: geprüft wird reine Logik, die ohne React Native auskommt
 * (environment: node, kein Renderer, keine Expo-Module). Anlass war die
 * Auflösung der API-Adresse – ein Fehler, der sich sonst erst auf einem
 * Telefon zeigt, und dort als Zeitüberschreitung ohne Erklärung.
 *
 * Bildschirme und Expo-Aufrufe brauchen später eine eigene Umgebung
 * (jest-expo oder react-native-testing-library); das ist ein eigener Ausbau
 * und kein Grund, die prüfbare Logik ungeprüft zu lassen.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
  },
});
