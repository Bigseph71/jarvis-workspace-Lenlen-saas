"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import {
  ApiError,
  approveAbsence,
  cancelAbsence,
  createAbsence,
  listAbsences,
  listCaregivers,
  rejectAbsence,
  type Absence,
  type AbsenceStatus,
  type Caregiver,
  type CreateAbsenceInput,
} from "@len-len/api-client";
import { AbsenceForm } from "@/components/absence-form";

const PAGE_SIZE = 20;

type LoadState = "loading" | "ready" | "error";

const STATUS_STYLES: Record<AbsenceStatus, string> = {
  REQUESTED: "bg-amber-100 text-amber-800",
  APPROVED: "bg-green-100 text-green-800",
  REJECTED: "bg-red-100 text-red-800",
  CANCELED: "bg-gray-200 text-gray-600",
};

const STATUS_FILTERS: (AbsenceStatus | "ALL")[] = [
  "ALL",
  "REQUESTED",
  "APPROVED",
  "REJECTED",
  "CANCELED",
];

export default function AbsencesPage() {
  const t = useTranslations("absences");
  const tc = useTranslations("common");
  const locale = useLocale();

  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<AbsenceStatus | "ALL">("ALL");
  const [reloadKey, setReloadKey] = useState(0);

  const [absences, setAbsences] = useState<Absence[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [state, setState] = useState<LoadState>("loading");

  const [caregivers, setCaregivers] = useState<Caregiver[]>([]);
  const [formOpen, setFormOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setState("loading");
    listAbsences({
      page,
      pageSize: PAGE_SIZE,
      ...(status === "ALL" ? {} : { status }),
    })
      .then((res) => {
        if (!active) return;
        setAbsences(res.data);
        setTotal(res.total);
        setTotalPages(res.totalPages);
        setState("ready");
      })
      .catch(() => {
        if (active) setState("error");
      });
    return () => {
      active = false;
    };
  }, [page, status, reloadKey]);

  // Die Fachkräfte braucht nur das Formular – erst laden, wenn es aufgeht.
  useEffect(() => {
    if (!formOpen || caregivers.length > 0) return;
    let active = true;
    listCaregivers({ pageSize: 100 })
      .then((res) => {
        if (active) setCaregivers(res.data);
      })
      .catch(() => {
        /* Das Formular zeigt dann eine leere Auswahl. */
      });
    return () => {
      active = false;
    };
  }, [formOpen, caregivers.length]);

  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  async function handleCreate(input: CreateAbsenceInput) {
    setFormError(null);
    setSubmitting(true);
    try {
      await createAbsence(input);
      setFormOpen(false);
      setPage(1);
      reload();
    } catch (err) {
      // 422 = fachliche Ablehnung des Backends (z.B. Überschneidung). Die
      // Begründung durchreichen statt sie durch einen Allgemeinplatz ersetzen.
      setFormError(err instanceof ApiError && err.status === 422 ? err.message : tc("errorGeneric"));
    } finally {
      setSubmitting(false);
    }
  }

  async function decide(
    absence: Absence,
    action: (id: string) => Promise<Absence>,
    confirmKey?: string,
  ) {
    if (confirmKey && !window.confirm(t(confirmKey))) return;
    setActionError(null);
    try {
      await action(absence.id);
      reload();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : tc("errorGeneric"));
    }
  }

  const formatDate = (iso: string): string =>
    new Date(iso).toLocaleDateString(locale, { year: "numeric", month: "2-digit", day: "2-digit" });

  return (
    <section>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-gray-900">{t("title")}</h1>
        <button
          type="button"
          onClick={() => {
            setFormError(null);
            setFormOpen((open) => !open);
          }}
          className="whitespace-nowrap rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-gray-700"
        >
          {formOpen ? t("form.close") : t("new")}
        </button>
      </div>

      {formOpen ? (
        <div className="mt-4 rounded-lg border border-gray-200 bg-white p-4">
          <AbsenceForm
            caregivers={caregivers}
            submitting={submitting}
            error={formError}
            onSubmit={handleCreate}
            onCancel={() => setFormOpen(false)}
          />
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {STATUS_FILTERS.map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => {
              setStatus(value);
              setPage(1);
            }}
            className={`rounded-md border px-3 py-1.5 text-sm transition ${
              status === value
                ? "border-gray-900 bg-gray-900 text-white"
                : "border-gray-300 text-gray-700 hover:bg-gray-100"
            }`}
          >
            {value === "ALL" ? t("filters.all") : t(`status.${value}`)}
          </button>
        ))}
      </div>

      {actionError ? (
        <p role="alert" className="mt-3 text-sm text-red-600">
          {actionError}
        </p>
      ) : null}

      <div className="mt-4 overflow-hidden rounded-lg border border-gray-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-gray-200 bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-4 py-3 font-medium">{t("columns.caregiver")}</th>
              <th className="px-4 py-3 font-medium">{t("columns.type")}</th>
              <th className="px-4 py-3 font-medium">{t("columns.period")}</th>
              <th className="px-4 py-3 font-medium">{t("columns.status")}</th>
              <th className="px-4 py-3 font-medium">
                <span className="sr-only">{t("columns.actions")}</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {state === "loading" ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-gray-400">
                  {t("loading")}
                </td>
              </tr>
            ) : state === "error" ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-red-600">
                  {t("error")}
                </td>
              </tr>
            ) : absences.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-gray-400">
                  {t("empty")}
                </td>
              </tr>
            ) : (
              absences.map((a) => (
                <tr key={a.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">
                    {a.caregiver ? `${a.caregiver.lastName}, ${a.caregiver.firstName}` : "—"}
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {t(`types.${a.type}`)}
                    {a.reason ? <span className="block text-xs text-gray-400">{a.reason}</span> : null}
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {formatDate(a.startDate)} — {formatDate(a.endDate)}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[a.status]}`}
                    >
                      {t(`status.${a.status}`)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-3">
                      {a.status === "REQUESTED" ? (
                        <>
                          <button
                            type="button"
                            onClick={() => void decide(a, approveAbsence)}
                            className="text-sm font-medium text-green-700 underline-offset-2 hover:underline"
                          >
                            {t("actions.approve")}
                          </button>
                          <button
                            type="button"
                            onClick={() => void decide(a, rejectAbsence, "confirmReject")}
                            className="text-sm font-medium text-red-600 underline-offset-2 hover:underline"
                          >
                            {t("actions.reject")}
                          </button>
                        </>
                      ) : null}
                      {a.status === "REQUESTED" || a.status === "APPROVED" ? (
                        <button
                          type="button"
                          onClick={() => void decide(a, cancelAbsence, "confirmCancel")}
                          className="text-sm font-medium text-gray-700 underline-offset-2 hover:underline"
                        >
                          {t("actions.cancel")}
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {state === "ready" && total > 0 ? (
        <div className="mt-4 flex items-center justify-between text-sm text-gray-600">
          <span>{t("count", { total })}</span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="rounded-md border border-gray-300 px-3 py-1.5 transition hover:bg-gray-100 disabled:opacity-40"
            >
              {t("previous")}
            </button>
            <span>{t("pageOf", { page, totalPages })}</span>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="rounded-md border border-gray-300 px-3 py-1.5 transition hover:bg-gray-100 disabled:opacity-40"
            >
              {t("next")}
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
