"use client";

import { useCallback, useState } from "react";
import { useTranslations } from "next-intl";
import { ARBITRATIONS, type ArbitrationId } from "@/lib/demo/uebersicht";

/** Dauer des Ausblendens (Handoff § Arbitrages). */
const DISMISS_MS = 200;

const CATEGORY_TONE: Record<"clay" | "clayDeep", string> = {
  clay: "text-clay",
  clayDeep: "text-clay-deep",
};

const DOT_TONE: Record<"clay" | "clayDeep", string> = {
  clay: "bg-clay",
  clayDeep: "bg-clay-deep",
};

/**
 * "Ce qui demande une décision".
 *
 * Der wichtigste Baustein der Übersicht, und der am leichtesten misszuverstehende.
 * Es ist KEINE Benachrichtigungsliste: der Optimierer legt hier die Konflikte
 * offen, die er nicht allein entscheiden darf, und nennt zu jedem BEIDE Kosten.
 * Wer ihn zu "3 neue Hinweise" zusammenfasst, nimmt der Koordination genau die
 * Information, für die der Bildschirm gebaut ist.
 *
 * Die beiden Aktionen schliessen einander aus. Ein Klick blendet die Karte aus
 * und zählt die Pastille in der Kopfzeile herunter – heute nur in der
 * Oberfläche, weil es den Endpunkt noch nicht gibt (siehe lib/demo).
 */
export function ArbitrationsCard({ withSubtitle = true }: { withSubtitle?: boolean }) {
  const t = useTranslations("overview.arbitrations");
  const [leaving, setLeaving] = useState<ArbitrationId | null>(null);
  const [dismissed, setDismissed] = useState<ArbitrationId[]>([]);

  const decide = useCallback((id: ArbitrationId) => {
    setLeaving(id);
    // Erst nach dem Ausblenden aus der Liste nehmen, sonst springt die Karte
    // weg statt zu verschwinden. Unter `prefers-reduced-motion` läuft der
    // Übergang praktisch mit Dauer 0 (globals.css), das Verhalten bleibt gleich.
    window.setTimeout(() => {
      setDismissed((prev) => [...prev, id]);
      setLeaving(null);
    }, DISMISS_MS);
  }, []);

  const open = ARBITRATIONS.filter((a) => !dismissed.includes(a.id));

  return (
    <section className="rounded-card border border-clay-wash-border bg-clay-wash p-6">
      <h2 className="font-serif text-[22px] font-normal leading-tight text-ink-primary">
        {t("title")}
      </h2>
      {withSubtitle ? <p className="mt-1 text-label text-ink-muted">{t("subtitle")}</p> : null}

      {open.length === 0 ? (
        <p className="mt-4 text-row text-ink-secondary">{t("empty")}</p>
      ) : (
        <ul className="mt-4 flex flex-col gap-2.5">
          {open.map((item) => (
            <li
              key={item.id}
              className={`overflow-hidden rounded-tile border border-clay-wash-border bg-app p-4 transition-all ease-out ${
                leaving === item.id ? "max-h-0 border-0 p-0 opacity-0" : "max-h-96 opacity-100"
              }`}
              style={{ transitionDuration: `${DISMISS_MS}ms` }}
            >
              <p className="flex items-center gap-2">
                <span
                  aria-hidden="true"
                  className={`h-1.5 w-1.5 flex-none rounded-full ${DOT_TONE[item.tone]}`}
                />
                <span
                  className={`text-3xs font-bold uppercase tracking-[.13em] ${CATEGORY_TONE[item.tone]}`}
                >
                  {t(`${item.id}.category`)}
                </span>
              </p>

              <p className="mt-2 text-row font-medium leading-[1.45] text-ink-primary">
                {t(`${item.id}.statement`)}
              </p>

              <div className="mt-3.5 flex flex-wrap gap-2">
                {/* Die empfohlene Entscheidung zuerst und gefüllt. Beide sind
                    erlaubt – die Empfehlung ist eine Empfehlung, keine Vorgabe. */}
                <button
                  type="button"
                  onClick={() => decide(item.id)}
                  className="rounded-full bg-clay px-3.5 py-[7px] text-meta font-semibold text-on-clay transition-colors duration-120 hover:bg-clay-hover"
                >
                  {t(`${item.id}.primary`)}
                </button>
                <button
                  type="button"
                  onClick={() => decide(item.id)}
                  className="rounded-full border border-strong bg-inset px-3.5 py-[7px] text-meta font-medium text-ink-body transition-colors duration-120 hover:bg-muted"
                >
                  {t(`${item.id}.secondary`)}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
