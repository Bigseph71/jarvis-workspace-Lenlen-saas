"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { PrimaryButton, SecondaryButton } from "@/components/ui/buttons";
import { PUBLICATION_SUMMARY } from "@/lib/demo/planung";

/**
 * Veröffentlichung des Entwurfs an die Fachkräfte.
 *
 * Zwei Regeln aus dem Handoff, beide inhaltlich begründet:
 *
 * 1. GESPERRT, solange eine Qualifikations-Arbitrage offen ist. Eine fehlende
 *    Qualifikation ist ein regulatorisches Risiko (Regel métier 4: die
 *    Vertretung braucht dieselbe Qualifikation), keine Abwägung. Ein verletztes
 *    Zeitfenster dagegen hält den Plan NICHT auf – es ist unangenehm, aber
 *    erlaubt.
 *
 * 2. Eine Bestätigung, die zusammenfasst, was gleich passiert. Der Vorgang
 *    erreicht Dutzende Telefone auf einmal und lässt sich nicht zurücknehmen;
 *    die Zahlen davor sind die letzte Gelegenheit, einen Fehlgriff zu bemerken.
 *
 * Der Grund der Sperre steht SICHTBAR daneben. Ein ausgegrauter Knopf ohne
 * Erklärung ist eine Sackgasse: er sagt "nein", nicht "noch nicht, und
 * deswegen".
 */
export function PublishAction({ blocked }: { blocked: boolean }) {
  const t = useTranslations("planning.publish");
  const format = useFormatter();
  const [open, setOpen] = useState(false);
  const dialog = useRef<HTMLDivElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;
    // Fokus in den Dialog, sonst bliebe er auf dem Knopf dahinter und die
    // Tastatur führte an der Bestätigung vorbei.
    confirmRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") close();
    };
    const onPointerDown = (event: MouseEvent): void => {
      if (!dialog.current?.contains(event.target as Node)) close();
    };
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("mousedown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("mousedown", onPointerDown);
    };
  }, [open, close]);

  const summary = [
    { key: "tours", value: format.number(PUBLICATION_SUMMARY.tours) },
    { key: "visits", value: format.number(PUBLICATION_SUMMARY.visits) },
    { key: "kilometers", value: format.number(PUBLICATION_SUMMARY.kilometers) },
    { key: "notified", value: format.number(PUBLICATION_SUMMARY.caregiversNotified) },
  ];

  return (
    <>
      <div className="flex flex-col items-end gap-1.5">
        <PrimaryButton
          disabled={blocked}
          aria-describedby={blocked ? "publish-blocked" : undefined}
          onClick={() => setOpen(true)}
        >
          {t("action")}
        </PrimaryButton>
        {blocked ? (
          <p id="publish-blocked" className="max-w-xs text-right text-meta text-clay-deep">
            {t("blocked")}
          </p>
        ) : null}
      </div>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-forest-deep/40 p-4">
          <div
            ref={dialog}
            role="dialog"
            aria-modal="true"
            aria-labelledby="publish-title"
            className="w-full max-w-md rounded-card border border-soft bg-app p-6 shadow-app"
          >
            <h2 id="publish-title" className="font-serif text-[24px] font-normal text-ink-primary">
              {t("confirmTitle")}
            </h2>
            <p className="mt-2 text-row text-ink-secondary">{t("confirmBody")}</p>

            <dl className="mt-5 grid grid-cols-2 gap-4">
              {summary.map((item) => (
                <div key={item.key} className="rounded-tile border border-soft bg-surface p-4">
                  <dt className="text-meta text-ink-tertiary">{t(`summary.${item.key}`)}</dt>
                  <dd className="mt-1 font-serif text-[26px] leading-none text-ink-primary">
                    {item.value}
                  </dd>
                </div>
              ))}
            </dl>

            <div className="mt-6 flex justify-end gap-2.5">
              <SecondaryButton onClick={close}>{t("cancel")}</SecondaryButton>
              {/* Noch ohne Wirkung: es gibt keinen Endpunkt zum Veröffentlichen.
                  Der Dialog schliesst, und der Entwurf bleibt, was er war. */}
              <PrimaryButton ref={confirmRef} onClick={close}>
                {t("confirm")}
              </PrimaryButton>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
