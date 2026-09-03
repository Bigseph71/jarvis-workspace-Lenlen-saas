import type { ReactNode } from "react";

/**
 * Statuspastille (Handoff § Pastilles de statut).
 *
 * Drei Tönungen, und die Zuordnung ist inhaltlich, nicht dekorativ:
 * `positive` heisst "läuft wie geplant", `attention` heisst "jemand muss
 * hinsehen", `neutral` heisst "noch nichts passiert". Dieselben drei Tönungen
 * tragen auf allen vier Oberflächen dieselbe Bedeutung – deshalb eine
 * Komponente und keine Klassenliste je Aufrufstelle.
 */
export type PillTone = "positive" | "attention" | "neutral";

const TONE: Record<PillTone, string> = {
  positive: "bg-sage-wash text-sage-deep",
  attention: "bg-clay-wash text-clay-deep",
  neutral: "bg-neutral-pill text-ink-tertiary",
};

export function StatusPill({
  tone,
  children,
  className = "",
}: {
  tone: PillTone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex shrink-0 items-center whitespace-nowrap rounded-full px-3 py-1.5 text-pill font-semibold ${TONE[tone]} ${className}`}
    >
      {children}
    </span>
  );
}
