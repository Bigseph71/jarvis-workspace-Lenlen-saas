"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { patientVisitNotes, type PatientVisitNote } from "@len-len/api-client";

/** Anzahl der pro Seite geladenen Notizen. */
const PAGE_SIZE = 20;

type LoadState = "loading" | "ready" | "error";

/**
 * Verlauf: die Besuchsnotizen eines Patienten, neueste zuerst.
 *
 * Eigene Komponente und ausdrücklich NICHT beim Öffnen der Akte geladen: der
 * Endpunkt schreibt einen Lese-Eintrag ins Audit-Log (DSGVO). Würde er bei jedem
 * Aufruf der Akte mitlaufen, stünde im Protokoll, jeder habe die Pflegenotizen
 * gelesen – auch wer sie nie gesehen hat. Das Protokoll soll den tatsächlichen
 * Zugriff festhalten, nicht den möglichen.
 */
export function PatientVisitNotes({ patientId }: { patientId: string }) {
  const t = useTranslations("patients.detail.notes");
  const locale = useLocale();

  const [notes, setNotes] = useState<PatientVisitNote[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [state, setState] = useState<LoadState>("loading");

  useEffect(() => {
    let active = true;
    setState("loading");
    patientVisitNotes(patientId, { page, pageSize: PAGE_SIZE })
      .then((res) => {
        if (!active) return;
        setNotes(res.data);
        setTotal(res.total);
        setState("ready");
      })
      .catch(() => {
        if (active) setState("error");
      });
    return () => {
      active = false;
    };
  }, [patientId, page]);

  const formatDateTime = useCallback(
    (iso: string) =>
      new Date(iso).toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" }),
    [locale],
  );

  if (state === "loading") return <p className="text-gray-400">{t("loading")}</p>;
  if (state === "error") return <p className="text-red-600">{t("error")}</p>;
  if (notes.length === 0) return <p className="text-gray-400">{t("empty")}</p>;

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div>
      <p className="text-sm text-gray-500">{t("count", { count: total })}</p>

      <ol className="mt-4 space-y-3">
        {notes.map((n) => (
          <li
            key={n.id}
            className={`rounded-lg border bg-white p-4 ${
              n.hasIncident ? "border-amber-300 bg-amber-50" : "border-gray-200"
            }`}
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold text-gray-900">
                {formatDateTime(n.scheduledAt)}
              </span>
              {n.hasIncident ? (
                <span className="rounded-full bg-amber-200 px-2 py-0.5 text-xs font-medium text-amber-900">
                  {t("incident")}
                </span>
              ) : null}
              {n.isEmergency ? (
                <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800">
                  {t("emergency")}
                </span>
              ) : null}
            </div>

            <p className="mt-1 text-xs text-gray-500">
              {/* Wer den Besuch geleistet hat, nicht wer zugeteilt war (Regel 4):
                  bei einer Vertretung hat die Vertretung beobachtet. */}
              {n.caregiver
                ? t("byCaregiver", {
                    name: `${n.caregiver.lastName}, ${n.caregiver.firstName}`,
                  })
                : t("noCaregiver")}
              {n.visitNoteWrittenAt
                ? ` · ${t("writtenAt", { date: formatDateTime(n.visitNoteWrittenAt) })}`
                : null}
            </p>

            {/* whitespace-pre-line: die Fachkraft tippt auf dem Telefon in
                Zeilen, und diese Gliederung ist Teil der Aussage. */}
            <p className="mt-2 whitespace-pre-line text-sm text-gray-900">{n.visitNote}</p>
          </li>
        ))}
      </ol>

      {totalPages > 1 ? (
        <div className="mt-4 flex items-center gap-3">
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 transition hover:bg-gray-100 disabled:opacity-40"
          >
            {t("previous")}
          </button>
          <span className="text-sm text-gray-500">{t("pageOf", { page, totalPages })}</span>
          <button
            type="button"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 transition hover:bg-gray-100 disabled:opacity-40"
          >
            {t("next")}
          </button>
        </div>
      ) : null}
    </div>
  );
}
