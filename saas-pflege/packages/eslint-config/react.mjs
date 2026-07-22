import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";
import base from "./base.mjs";

/**
 * Basis + React/React-Hooks-Regeln für die mobile App (Expo / React Native,
 * TSX). Web nutzt stattdessen die Next-Konfiguration (./next.mjs).
 */
export default [
  ...base,
  {
    files: ["**/*.{ts,tsx}"],
    plugins: { react, "react-hooks": reactHooks },
    languageOptions: {
      globals: { ...globals.browser },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    settings: { react: { version: "detect" } },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // Mit dem neuen JSX-Transform (React 17+/RN) nicht mehr nötig.
      "react/react-in-jsx-scope": "off",
      "react/prop-types": "off",
    },
  },
];
