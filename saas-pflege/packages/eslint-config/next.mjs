import { FlatCompat } from "@eslint/eslintrc";

/**
 * Next.js-Konfiguration (Flat Config) für die Web-App, konsumiert über
 * `next lint`. Bringt die offiziellen Next-Regeln (core-web-vitals) inklusive
 * React-/Hooks-Regeln sowie das Next-eigene TypeScript-Preset mit.
 *
 * eslint-config-next liefert bislang nur eine Legacy-Shareable-Config – FlatCompat
 * übersetzt sie in Flat Config. baseDirectory zeigt auf dieses Paket, damit die
 * Next-Plugins aus dessen Abhängigkeiten aufgelöst werden.
 */
const compat = new FlatCompat({ baseDirectory: import.meta.dirname });

export default [
  {
    ignores: ["**/dist/**", "**/.next/**", "**/.turbo/**", "**/node_modules/**"],
  },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
      ],
    },
  },
];
