import Svg, { Circle, Path, Rect } from "react-native-svg";
import { color } from "@/lib/theme";

/**
 * Schematische Tourenkarte über der Tagesliste (Handoff § 4a).
 *
 * ────────────────────────────────────────────────────────────────────────────
 *  PLATZHALTER. Kein echter Kartenhintergrund.
 * ────────────────────────────────────────────────────────────────────────────
 *
 * Dieselben Vorbehalte wie im Web: die Strassen sind gezeichnete Kurven, die
 * Punkte entsprechen keinem Ort. In der Produktion gehört hier ein echter
 * Vektor-Hintergrund hin, und dessen Kacheln dürfen wegen der
 * Patientenadressen (mittelbare Gesundheitsdaten) nicht bei einem beliebigen
 * Anbieter liegen.
 *
 * Ohne Animation, anders als im Web. Auf dem Telefon läuft dieser Bildschirm
 * den ganzen Tag im Vordergrund; eine sich wiederholende Zeichenanimation
 * kostet dort Akku, und der Akku ist am Nachmittag das knappste Gut einer
 * Fachkraft.
 */
export function MiniMap({ height = 150 }: { height?: number }) {
  return (
    <Svg width="100%" height={height} viewBox="0 0 360 150" preserveAspectRatio="xMidYMid slice">
      <Rect x="0" y="0" width="360" height="150" fill={color.forestMap} />

      <Path
        d="M-10 46 C80 40 130 66 220 58 C290 52 330 34 370 38"
        stroke={color.forestRoad}
        strokeWidth={16}
        strokeLinecap="round"
        fill="none"
      />
      <Path
        d="M96 -10 C104 44 84 84 108 130"
        stroke={color.forestRoad}
        strokeWidth={13}
        strokeLinecap="round"
        fill="none"
      />
      <Path
        d="M-10 112 C90 106 170 124 260 112 C310 105 340 116 370 112"
        stroke={color.forestRoad}
        strokeWidth={12}
        strokeLinecap="round"
        fill="none"
      />

      <Path
        d="M40 122 C110 96 130 44 210 40 C270 37 300 66 344 54"
        stroke={color.sand}
        strokeWidth={2.6}
        strokeLinecap="round"
        fill="none"
      />
      <Circle cx="40" cy="122" r="4.5" fill={color.sand} />
      <Circle cx="210" cy="40" r="4.5" fill={color.sand} />
      <Circle cx="344" cy="54" r="4.5" fill={color.sand} />

      {/* Live-Position. Der clay-Kern ist der einzige seiner Farbe auf der
          Karte und damit unverwechselbar. */}
      <Circle cx="126" cy="86" r="11" fill={color.onForest} opacity={0.22} />
      <Circle cx="126" cy="86" r="7.5" fill={color.onForest} />
      <Circle cx="126" cy="86" r="3" fill={color.clay} />
    </Svg>
  );
}
