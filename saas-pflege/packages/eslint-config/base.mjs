import js from "@eslint/js";
import tseslint from "typescript-eslint";
import globals from "globals";

/**
 * Gemeinsame ESLint-Basiskonfiguration (Flat Config) für alle TypeScript-Pakete
 * im Node-Kontext (Backend, Worker, geteilte Libraries).
 *
 * Bewusst OHNE typgestützte Regeln (recommendedTypeChecked): das würde für
 * jedes Paket parserOptions.project verlangen und den Lint spürbar verlangsamen.
 * Die TS-Compiler-Optionen (strict, noUnusedLocals ...) decken die typbasierten
 * Fälle bereits im `typecheck`-Schritt ab.
 */
export default tseslint.config(
  {
    // Generierte / nicht zu lintende Artefakte global ausschließen.
    ignores: [
      "**/dist/**",
      "**/.next/**",
      "**/.turbo/**",
      "**/coverage/**",
      "**/node_modules/**",
      "**/*.config.js",
      "**/*.config.mjs",
      "**/*.config.cjs",
      "**/*.config.ts",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: { ...globals.node },
    },
    rules: {
      // Unbenutzte Variablen: mit "_" bewusst als ignoriert markierbar.
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
      ],
    },
  },
);
