import type { Config } from "tailwindcss";

/**
 * Tokens der UI-Überarbeitung (siehe design_handoff_lenlen_refonte/README.md).
 *
 * Die Hex-Werte des Handoffs stehen AUSSCHLIESSLICH hier. Wer sie in eine
 * Komponente schreibt, nimmt der Palette ihren Zweck: sie soll an einer Stelle
 * änderbar bleiben, und die vier Oberflächen sollen sich nicht auseinander
 * entwickeln.
 *
 * Die Namen folgen dem Handoff (`bg/page` -> `bg-page`), damit ein Wert im
 * Dokument ohne Übersetzungstabelle wiederzufinden ist.
 */
export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Flächen
        page: "#F6F3EC",
        app: "#FFFDF9",
        surface: "#F8F5EE",
        inset: "#F4F1E8",
        muted: "#EFEBE1",

        // Linien
        hairline: "#F2EDE3",
        soft: "#EDE7DA",
        "border-default": "#E9E3D6",
        strong: "#E3DDD0",

        // Schrift auf hellem Grund
        ink: {
          primary: "#1E211C",
          body: "#3B3E36",
          secondary: "#61655B",
          tertiary: "#767A6E",
          muted: "#8A8D82",
          faint: "#9B9E92",
        },

        // Handlungsfarbe
        clay: {
          DEFAULT: "#B4552F",
          deep: "#A9542E",
          hover: "#9C4726",
          wash: "#F7EDE6",
          "wash-border": "#EEDCD0",
          // Sekundärtext auf clay-wash (Leerzustand Plattform).
          soft: "#8B7261",
          // Statuspunkt "gesperrt" in der Plattform-Aufschlüsselung.
          dim: "#C08D6F",
        },

        sand: {
          DEFAULT: "#E8BFA0",
          deep: "#D3A183",
        },

        sage: {
          DEFAULT: "#7C8B6B",
          deep: "#4A5A38",
          text: "#5D6E4C",
          wash: "#EAEEE3",
        },

        // Dunkle Flächen: Karte, Plattform-Kopfzeile, Umsatzpanel.
        forest: {
          DEFAULT: "#3F4A38",
          deep: "#2C3327",
          map: "#36402F",
          road: "#404B38",
          "road-alt": "#3D4835",
          block: "#3A4433",
        },

        // Schrift auf dunklem Grund
        "on-forest": {
          primary: "#FBF8F0",
          body: "#EFEDE2",
          secondary: "#D8DACD",
          muted: "#B8C0AB",
          faint: "#A9B29C",
          dim: "#8E9884",
        },

        neutral: {
          pill: "#F1EFE7",
          dot: "#CFCBBE",
          track: "#EFEAE0",
          divider: "#EFEAE0",
        },

        // Schrift auf der Handlungsfarbe.
        "on-clay": "#FFF9F4",
      },

      fontFamily: {
        // Über CSS-Variablen aus next/font gesetzt (siehe layout.tsx): so lädt
        // Next die Dateien selbst und der Wechsel auf Self-Hosting (DSGVO)
        // ändert nichts an den Klassen.
        serif: ["var(--font-newsreader)", "Newsreader", "serif"],
        sans: ["var(--font-hanken)", "Hanken Grotesk", "system-ui", "sans-serif"],
      },

      borderRadius: {
        check: "7px",
        avatar: "11px",
        "nav-item": "14px",
        field: "18px",
        tile: "20px",
        "card-inner": "22px",
        "mobile-card": "24px",
        kpi: "26px",
        card: "30px",
        app: "34px",
        phone: "48px",
      },

      boxShadow: {
        app: "0 2px 4px rgba(30,33,28,.03), 0 40px 80px -50px rgba(30,33,28,.35)",
        phone: "0 40px 70px -40px rgba(30,33,28,.5)",
        primary: "0 8px 18px -10px rgba(180,85,47,.8)",
        tab: "0 1px 3px rgba(30,33,28,.1)",
        pill: "0 1px 2px rgba(30,33,28,.06)",
      },

      // Die Schriftgrade des Handoffs sind teils halbe Pixel (12.5, 13.5, 11.5).
      // Sie hier zu führen erspart beliebige `text-[13.5px]` im Markup.
      fontSize: {
        "2xs": ["10.5px", { lineHeight: "1.2" }],
        "3xs": ["11px", { lineHeight: "1.2" }],
        micro: ["11.5px", { lineHeight: "1.3" }],
        meta: ["12.5px", { lineHeight: "1.4" }],
        pill: ["12px", { lineHeight: "1" }],
        label: ["13px", { lineHeight: "1.4" }],
        "label-lg": ["13.5px", { lineHeight: "1.4" }],
        row: ["14px", { lineHeight: "1.4" }],
        body: ["16px", { lineHeight: "1.6" }],
        "body-lg": ["17px", { lineHeight: "1.62" }],
      },

      transitionDuration: {
        // Hover-Übergänge des Handoffs.
        120: "120ms",
      },
    },
  },
  plugins: [],
} satisfies Config;
