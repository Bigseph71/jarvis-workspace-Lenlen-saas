import type { ReactNode } from "react";

/**
 * Kennzahlenkarte der Plattform (Handoff § Grille KPI plateforme).
 *
 * Wie die Karte der Übersicht, aber OHNE Sparkline: hier gibt es keinen
 * Verlauf zu zeigen. Statt einer leeren Kurve steht unter dem Wert eine Zeile,
 * die ihn einordnet ("3 aktiv, 1 in der Testphase"). Eine Zahl ohne diese
 * Zeile lässt offen, ob sie gut ist.
 */
export function PlatformKpi({
  label,
  value,
  hint,
  tone = "neutral",
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  /** `positive` färbt die Hinweiszeile sauge – für Zahlen, die zählen. */
  tone?: "neutral" | "positive";
}) {
  return (
    <div className="rounded-kpi border border-soft bg-surface p-[22px]">
      <p className="text-micro font-semibold uppercase tracking-[.13em] text-ink-faint">{label}</p>
      <p className="mt-3 font-serif text-[38px] leading-none tracking-[-.02em] text-ink-primary">
        {value}
      </p>
      {hint ? (
        <p
          className={`mt-[9px] text-meta font-medium ${
            tone === "positive" ? "text-sage-deep" : "text-ink-tertiary"
          }`}
        >
          {hint}
        </p>
      ) : null}
    </div>
  );
}
