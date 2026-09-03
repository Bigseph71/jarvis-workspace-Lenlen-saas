import type { ReactNode } from "react";

/**
 * Inhaltskarte: weisser Grund, Rayon 30, Titel in der Serifenschrift.
 *
 * Der Handoff wiederholt dieses Gerüst auf allen vier Oberflächen (Touren,
 * Abwesenheiten, Qualifikationen, Organisationen, Regeln …). Als Komponente
 * bleibt der Abstand zwischen Titel und Untertitel überall gleich – von Hand
 * wiederholt driftet er nach der dritten Kopie.
 */
export function ContentCard({
  title,
  subtitle,
  action,
  footer,
  className = "",
  bodyClassName = "",
  children,
}: {
  title: string;
  subtitle?: string;
  /** Rechts neben dem Titel (Segment-Umschalter, Nebenaktion). */
  action?: ReactNode;
  /** Fusszeile innerhalb der Karte, oberhalb des Randes. */
  footer?: ReactNode;
  className?: string;
  bodyClassName?: string;
  children: ReactNode;
}) {
  return (
    <section className={`rounded-card border border-soft bg-white p-6 ${className}`}>
      <div className="mb-1.5 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-serif text-[22px] font-normal leading-tight text-ink-primary">
            {title}
          </h2>
          {subtitle ? <p className="mt-1 text-label text-ink-muted">{subtitle}</p> : null}
        </div>
        {action}
      </div>
      <div className={bodyClassName}>{children}</div>
      {footer}
    </section>
  );
}
