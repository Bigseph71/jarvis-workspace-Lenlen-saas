import type { Tone } from "@/lib/demo/uebersicht";

const STROKE: Record<Tone, string> = { sage: "#7C8B6B", clay: "#B4552F" };
const TEXT: Record<Tone, string> = { sage: "text-sage", clay: "text-clay" };

/**
 * Kennzahlenkarte (Handoff § Composant : carte KPI).
 *
 * Die Sparkline hat bewusst weder Achsen noch Füllung noch Beschriftung: sie
 * zeigt eine Richtung, keinen Messwert. Der Messwert steht daneben, gross.
 * Deshalb ist sie auch `aria-hidden` – vorgelesen ergäbe eine Kurve ohne
 * Skala nichts, und das Delta darunter sagt dasselbe in Worten.
 */
export function KpiCard({
  label,
  value,
  unit,
  delta,
  tone,
  spark,
}: {
  label: string;
  value: string;
  unit?: string;
  delta: string;
  tone: Tone;
  spark: string;
}) {
  return (
    <div className="flex flex-col gap-4 rounded-kpi border border-soft bg-surface px-[22px] pb-[18px] pt-[22px]">
      <div className="text-label font-medium text-ink-tertiary">{label}</div>
      <div className="flex items-end justify-between gap-3">
        <div>
          <div className="font-serif text-[38px] leading-none tracking-[-.02em] text-ink-primary">
            {value}
            {unit ? <span className="text-[19px] text-ink-faint">{unit}</span> : null}
          </div>
          <div className={`mt-2 text-meta font-medium ${TEXT[tone]}`}>{delta}</div>
        </div>
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
      </div>
    </div>
  );
}
