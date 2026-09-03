/**
 * Tokens der UI-Überarbeitung, Fassung für React Native.
 *
 * Dieselben Werte wie im Web (apps/web/tailwind.config.ts) und aus derselben
 * Quelle (design_handoff_lenlen_refonte/README.md). Zwei Dateien, weil es
 * zwei Stilsysteme sind – Tailwind kann kein StyleSheet erzeugen –, aber die
 * NAMEN sind absichtlich gleich: wer eine Farbe im Handoff nachschlägt, findet
 * sie hier unter demselben Bezeichner wie dort und wie im Web.
 *
 * Wer hier etwas ändert, ändert es dort mit. Eine Palette, die in zwei Apps
 * auseinanderläuft, ist schlimmer als gar keine.
 */

export const color = {
  page: "#F6F3EC",
  app: "#FFFDF9",
  surface: "#F8F5EE",
  inset: "#F4F1E8",
  muted: "#EFEBE1",
  white: "#FFFFFF",

  hairline: "#F2EDE3",
  soft: "#EDE7DA",
  border: "#E9E3D6",
  strong: "#E3DDD0",

  ink: "#1E211C",
  inkBody: "#3B3E36",
  inkSecondary: "#61655B",
  inkTertiary: "#767A6E",
  inkMuted: "#8A8D82",
  inkFaint: "#9B9E92",

  clay: "#B4552F",
  clayDeep: "#A9542E",
  clayHover: "#9C4726",
  clayWash: "#F7EDE6",
  clayWashBorder: "#EEDCD0",
  claySoft: "#8B7261",
  clayDim: "#C08D6F",

  sand: "#E8BFA0",
  sandDeep: "#D3A183",

  sage: "#7C8B6B",
  sageDeep: "#4A5A38",
  sageText: "#5D6E4C",
  sageWash: "#EAEEE3",

  forest: "#3F4A38",
  forestDeep: "#2C3327",
  forestMap: "#36402F",
  forestRoad: "#404B38",
  forestRoadAlt: "#3D4835",
  forestBlock: "#3A4433",

  onForest: "#FBF8F0",
  onForestBody: "#EFEDE2",
  onForestSecondary: "#D8DACD",
  onForestMuted: "#B8C0AB",
  onForestFaint: "#A9B29C",
  onForestDim: "#8E9884",

  neutralPill: "#F1EFE7",
  neutralDot: "#CFCBBE",
  neutralTrack: "#EFEAE0",

  onClay: "#FFF9F4",
} as const;

/**
 * Schriftfamilien.
 *
 * Die Namen sind die der geladenen Dateien (siehe _layout.tsx). In React
 * Native gibt es keinen Fallback-Stapel wie im Web: steht hier ein Name, den
 * niemand geladen hat, zeigt Android die Systemschrift und iOS stürzt in
 * manchen Fassungen ab. Deshalb wird die Anwendung erst gerendert, wenn die
 * Dateien da sind.
 */
export const font = {
  serif: "Newsreader_400Regular",
  serifLight: "Newsreader_300Light",
  sans: "HankenGrotesk_400Regular",
  sansMedium: "HankenGrotesk_500Medium",
  sansSemi: "HankenGrotesk_600SemiBold",
  sansBold: "HankenGrotesk_700Bold",
} as const;

export const radius = {
  check: 7,
  avatar: 11,
  field: 18,
  tile: 20,
  card: 22,
  mobileCard: 24,
  block: 26,
  pill: 999,
} as const;

/**
 * Kleinste zulässige Höhe einer Berührungsfläche.
 *
 * Der Handoff nennt 44 als absolute Untergrenze; die Hauptaktionen liegen bei
 * 46–48. Der Wert steht hier und nicht in jeder Datei, weil er sonst beim
 * ersten engen Layout still unterschritten wird – und eine Fachkraft bedient
 * dieses Telefon mit Handschuhen im Treppenhaus.
 */
export const MIN_TOUCH_HEIGHT = 44;
