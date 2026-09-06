import { useTranslations } from "next-intl";

export type Tone = "sage" | "clay";

const STROKE: Record<Tone, string> = { sage: "#7C8B6B", clay: "#B4552F" };
const TEXT: Record<Tone, string> = { sage: "text-sage", clay: "text-clay" };

/**
 * Kennzahlenkarte (Handoff § Composant : carte KPI).
 *
 * Die Sparkline hat bewusst weder Achsen noch Füllung noch Beschriftung: sie
 * zeigt eine Richtung, keinen Messwert. Der Messwert steht daneben, gross.
 * Deshalb ist sie auch `aria-hidden` – vorgelesen ergäbe eine Kurve ohne
 * Skala nichts, und der Zusatz darunter sagt dasselbe in Worten.
 *
 * `spark` ist OPTIONAL, und das ist der Kern der Anbindung an echte Daten: eine
 * Kurve ist ein Verlauf, und einen Verlauf gibt es im Backend nirgends. Die
 * angebundenen Kennzahlen zeigen deshalb ihren heutigen Wert ohne Kurve, statt
 * eine erfundene Bewegung zu zeichnen. Wo die Kurve steht, steht auch `demo`.
 *
 * `demo` setzt eine sichtbare Marke auf die Karte. Ohne sie wäre ein
 * plausibler Beispielwert auf einem Bildschirm von einer Messung nicht zu
 * unterscheiden – und in der Pflege disponiert jemand danach.
 */
export function KpiCard({
  label,
  value,
  unit,
  hint,
  tone,
  spark,
  demo = false,
  pending = false,
}: {
  label: string;
  value: string;
  unit?: string;
  /** Zusatz unter der Zahl: was sie einschliesst, woher sie kommt. */
  hint: string;
  tone: Tone;
  /** Pfad der Sparkline (Koordinatensystem 76×34). Nur für Beispielwerte. */
  spark?: string;
  demo?: boolean;
  /** Noch nicht geladen: statt einer Zahl steht ein Strich. */
  pending?: boolean;
}) {
  const t = useTranslations("overview");

  return (
    <div className="flex flex-col gap-4 rounded-kpi border border-soft bg-surface px-[22px] pb-[18px] pt-[22px]">
      <div className="flex items-start justify-between gap-2">
        <span className="text-label font-medium text-ink-tertiary">{label}</span>
        {demo ? (
          <span className="flex-none rounded-full border border-strong bg-inset px-2 py-0.5 text-3xs font-bold uppercase tracking-[.1em] text-ink-faint">
            {t("demo.tag")}
          </span>
        ) : null}
      </div>
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <div className="font-serif text-[38px] leading-none tracking-[-.02em] text-ink-primary">
            {/*
              Ein Strich und keine 0, solange nichts geladen ist: eine 0 ist
              eine Aussage über den Tag, ein Strich ist das Eingeständnis,
              nichts zu wissen.
            */}
            {pending ? "—" : value}
            {unit && !pending ? <span className="text-[19px] text-ink-faint">{unit}</span> : null}
          </div>
          <div className={`mt-2 text-meta font-medium ${pending ? "text-ink-faint" : TEXT[tone]}`}>
            {hint}
          </div>
        </div>
        {spark ? (
          <svg
            width="76"
            height="34"
            viewBox="0 0 76 34"
            fill="none"
            aria-hidden="true"
            className="flex-none"
          >
            <path d={spark} stroke={STROKE[tone]} strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        ) : null}
      </div>
    </div>
  );
}
