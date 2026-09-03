/**
 * Schematischer Kartenhintergrund (Handoff § Composant : carte).
 *
 * ────────────────────────────────────────────────────────────────────────────
 *  PLATZHALTER. Kein echter Kartenhintergrund.
 * ────────────────────────────────────────────────────────────────────────────
 *
 * Strassen und Blöcke sind von Hand gezeichnete Kurven im Koordinatensystem
 * 720×660. Sie geben den Ton an, sie zeigen keine Geografie: die Punkte
 * entsprechen keinem Ort in Heidelberg oder sonstwo.
 *
 * In der Produktion gehört hierhin ein echter Vektor-Hintergrund (MapLibre GL),
 * eingefärbt auf dieselbe Palette. Der Handoff nennt dabei eine Auflage, die
 * über Technik hinausgeht: Patientenadressen sind mittelbare
 * Gesundheitsdaten, die Kacheln dürfen also nicht bei einem beliebigen
 * Anbieter liegen. Ein selbst gehosteter Kachelserver ist voraussichtlich
 * nötig. Das ist eine eigene Aufgabe, ausdrücklich nicht Teil dieser
 * Überarbeitung.
 *
 * Die Routen zeichnen sich beim Aufbau (`ll-draw`). Unter
 * `prefers-reduced-motion` erscheinen sie sofort vollständig – siehe die
 * Begründung in globals.css: eine bloss angehaltene Animation liesse die Karte
 * leer.
 */

interface Stop {
  cx: number;
  cy: number;
}

interface MapRoute {
  d: string;
  color: string;
  width: number;
  stops: Stop[];
  stopRadius: number;
  /** Dauer des Zeichnens in Sekunden. Fehlt bei der nicht veröffentlichten. */
  drawSeconds?: number;
  delaySeconds?: number;
  /** Gestrichelt = Entwurf, noch nicht veröffentlicht. */
  dashed?: boolean;
}

const ROUTES: MapRoute[] = [
  {
    d: "M100 500 C170 426 200 318 300 266 C400 213 470 266 560 202",
    color: "#E8BFA0",
    width: 3,
    stopRadius: 6,
    stops: [
      { cx: 100, cy: 500 },
      { cx: 300, cy: 266 },
      { cx: 560, cy: 202 },
    ],
    drawSeconds: 2.4,
  },
  {
    d: "M140 266 C230 244 260 350 350 404 C430 450 480 425 570 457",
    color: "#A9B29C",
    width: 2.4,
    stopRadius: 5,
    stops: [
      { cx: 140, cy: 266 },
      { cx: 350, cy: 404 },
      { cx: 570, cy: 457 },
    ],
    drawSeconds: 2.8,
    delaySeconds: 0.2,
  },
  {
    d: "M240 596 C300 532 380 553 440 500 C500 447 560 468 620 404",
    color: "#8E9884",
    width: 2,
    stopRadius: 4.5,
    stops: [
      { cx: 240, cy: 596 },
      { cx: 440, cy: 500 },
      { cx: 620, cy: 404 },
    ],
    dashed: true,
  },
];

/** Hauptachsen: dick, von Rand zu Rand. */
const AVENUES: { d: string; width: number }[] = [
  { d: "M-20 190 C140 178 220 232 340 222 C470 211 560 158 740 168", width: 26 },
  { d: "M120 -20 C132 150 96 254 140 402 C176 522 150 592 164 700", width: 22 },
  { d: "M-20 456 C160 446 300 494 460 466 C580 445 660 480 740 470", width: 20 },
  { d: "M520 -20 C512 128 556 244 528 370 C506 474 540 572 530 700", width: 18 },
];

const STREETS = [
  "M300 -20 C306 96 280 160 292 266",
  "M60 340 C170 318 210 372 300 362",
];

export function RouteMap({ label }: { label: string }) {
  return (
    <svg
      viewBox="0 0 720 660"
      preserveAspectRatio="xMidYMid slice"
      role="img"
      aria-label={label}
      className="absolute inset-0 h-full w-full"
    >
      <rect x="0" y="0" width="720" height="660" fill="#36402F" />

      {AVENUES.map((avenue) => (
        <path
          key={avenue.d}
          d={avenue.d}
          stroke="#404B38"
          strokeWidth={avenue.width}
          strokeLinecap="round"
          fill="none"
        />
      ))}

      {STREETS.map((d) => (
        <path key={d} d={d} stroke="#3D4835" strokeWidth={12} strokeLinecap="round" fill="none" />
      ))}

      {/* Parks. Sie brechen das Strassenraster auf; ohne sie liest sich der
          Hintergrund als Gitter und nicht als Stadt. */}
      <circle cx="600" cy="276" r="88" fill="#3A4433" />
      <circle cx="120" cy="574" r="72" fill="#3A4433" />

      {ROUTES.map((route) => (
        <g key={route.d}>
          <path
            d={route.d}
            stroke={route.color}
            strokeWidth={route.width}
            strokeLinecap="round"
            fill="none"
            // Gestrichelt: keine Zeichenanimation, sie würde das Muster
            // zerstören (dasharray trägt hier die Strichelung, nicht die Länge).
            strokeDasharray={route.dashed ? "6 7" : 1400}
            className={route.dashed ? undefined : "ll-draw"}
            style={
              route.dashed
                ? undefined
                : {
                    strokeDashoffset: 1400,
                    animationDuration: `${route.drawSeconds}s`,
                    animationDelay: route.delaySeconds ? `${route.delaySeconds}s` : undefined,
                  }
            }
          />
          <g fill={route.color}>
            {route.stops.map((stop) => (
              <circle key={`${stop.cx}-${stop.cy}`} cx={stop.cx} cy={stop.cy} r={route.stopRadius} />
            ))}
          </g>
        </g>
      ))}

      {/* Live-Position: Halo, Scheibe, Kern. Der Kern ist der einzige
          clay-Punkt auf der Karte und damit unverwechselbar. */}
      <circle cx="404" cy="235" r="11" fill="#FBF8F0" opacity=".22" className="ll-pulse" />
      <circle cx="404" cy="235" r="7.5" fill="#FBF8F0" />
      <circle cx="404" cy="235" r="3" fill="#B4552F" />
    </svg>
  );
}
