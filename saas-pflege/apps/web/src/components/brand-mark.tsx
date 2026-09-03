/**
 * Marke Len Len (Handoff § Assets).
 *
 * Ein Streckenzug, der von unten links nach oben rechts steigt: er liest sich
 * als optimierte Tour. Der volle Punkt ist der Start, die beiden offenen sind
 * Stationen.
 *
 * Zwei Fassungen, weil die Marke auf hellem UND auf dunklem Grund steht (die
 * Plattform-Kopfzeile ist `forest`). Die dunkle Fassung ist keine Aufhellung
 * derselben Farben, sondern ein eigener Satz aus der Palette – eine
 * umgerechnete Farbe träfe den Kontrast nicht.
 */
export function BrandMark({
  size = 26,
  variant = "light",
  className = "",
}: {
  size?: number;
  /** "light" = auf hellem Grund, "dark" = auf `forest`. */
  variant?: "light" | "dark";
  className?: string;
}) {
  const stroke = variant === "dark" ? "#E8BFA0" : "#B4552F";
  const start = variant === "dark" ? "#EFEDE2" : "#3F4A38";
  const node = variant === "dark" ? "#A9B29C" : "#7C8B6B";
  // Die Strichstärke folgt der Grösse: bei 22px wirkt 1.6 zu dünn.
  const width = size >= 26 ? 1.6 : 1.8;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 26 26"
      fill="none"
      aria-hidden="true"
      className={className}
    >
      <path
        d="M4 20C7.5 20 8 13 12 13C16 13 16.5 6 22 6"
        stroke={stroke}
        strokeWidth={width}
        strokeLinecap="round"
      />
      <circle cx="4" cy="20" r="2.4" fill={start} />
      <circle cx="12" cy="13" r="2" stroke={node} strokeWidth="1.5" />
      <circle cx="22" cy="6" r="2" stroke={node} strokeWidth="1.5" />
    </svg>
  );
}
