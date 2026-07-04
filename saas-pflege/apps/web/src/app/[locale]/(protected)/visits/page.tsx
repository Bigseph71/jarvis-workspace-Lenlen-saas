"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { addDays, formatDate, formatDateTime, startOfWeek } from "@/lib/datetime";
import {
  cancelVisit,
  listVisits,
  missingWeek,
  type MissingWeekResult,
  type Visit,
  type VisitStatus,
} from "@len-len/api-client";

type LoadState = "loading" | "ready" | "error";

const STATUS_FILTERS: (VisitStatus | "ALL")[] = [
  "ALL",
  "PLANNED",
  "IN_PROGRESS",
  "COMPLETED",
  "MISSED",
  "CANCELED",
];

const STATUS_STYLES: Record<VisitStatus, string> = {
  PLANNED: "bg-blue-100 text-blue-800",
  IN_PROGRESS: "bg-amber-100 text-amber-800",
  COMPLETED: "bg-green-100 text-green-800",
  MISSED: "bg-red-100 text-red-800",
  CANCELED: "bg-gray-100 text-gray-600",
};

const CANCELABLE: VisitStatus[] = ["PLANNED", "IN_PROGRESS"];

export default function VisitsPage() {
  const t = useTranslations("visits");
  const locale = useLocale();

  const [weekStart, setWeekStart] = useState<Date>(() => startOfWeek(new Date()));
  const [status, setStatus] = useState<VisitStatus | "ALL">("ALL");

  const [visits, setVisits] = useState<Visit[]>([]);
  const [state, setState] = useState<LoadState>("loading");
  const [alerts, setAlerts] = useState<MissingWeekResult | null>(null);

  const range = useMemo(() => {
    const to = addDays(weekStart, 7);
    return { from: weekStart.toISOString(), to: to.toISOString(), lastDay: addDays(weekStart, 6) };
  }, [weekStart]);

  const load = useCallback(() => {
    let active = true;
    setState("loading");
    listVisits({
      from: range.from,
      to: range.to,
      pageSize: 100,
      status: status === "ALL" ? undefined : status,
    })
      .then((res) => {
        if (!active) return;
        setVisits(res.data);
        setState("ready");
      })
      .catch(() => {
        if (active) setState("error");
      });
    missingWeek(range.from)
      .then((res) => {
        if (active) setAlerts(res);
      })
      .catch(() => {
        if (active) setAlerts(null);
      });
    return () => {
      active = false;
    };
  }, [range.from, range.to, status]);

  useEffect(() => load(), [load]);

  async function onCancel(id: string) {
    try {
      await cancelVisit(id);
      load();
    } catch {
      /* Stille Wiederholung über erneutes Laden würde nichts ändern; ignoriert. */
    }
  }

  function caregiverName(visit: Visit): string {
    const c = visit.caregiver ?? visit.assignedCaregiver;
    return c ? `${c.lastName}, ${c.firstName}` : "—";
  }

  return (
    <section>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-gray-900">{t("title")}</h1>
        <Link
          href="/visits/new"
          className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-gray-700"
        >
          {t("new")}
        </Link>
      </div>

      {/* Wochennavigation + Statusfilter */}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setWeekStart((w) => addDays(w, -7))}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm transition hover:bg-gray-100"
          >
            {t("prevWeek")}
          </button>
          <button
            type="button"
            onClick={() => setWeekStart(startOfWeek(new Date()))}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm transition hover:bg-gray-100"
          >
            {t("thisWeek")}
          </button>
          <button
            type="button"
            onClick={() => setWeekStart((w) => addDays(w, 7))}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm transition hover:bg-gray-100"
          >
            {t("nextWeek")}
          </button>
          <span className="ml-2 text-sm text-gray-600">
            {formatDate(weekStart, locale)} – {formatDate(range.lastDay, locale)}
          </span>
        </div>

        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as VisitStatus | "ALL")}
          className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:outline-none"
        >
          {STATUS_FILTERS.map((s) => (
            <option key={s} value={s}>
              {s === "ALL" ? t("allStatuses") : t(`status.${s}`)}
            </option>
          ))}
        </select>
      </div>

      {/* Alerte Regel métier 3 : Patienten ohne Wochenbesuch */}
      {alerts && alerts.count > 0 ? (
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <span className="font-medium">{t("missingTitle", { count: alerts.count })}</span>{" "}
          {alerts.patients
            .slice(0, 10)
            .map((p) => `${p.lastName}, ${p.firstName}`)
            .join(" · ")}
          {alerts.count > 10 ? " …" : ""}
        </div>
      ) : null}

      <div className="mt-4 overflow-hidden rounded-lg border border-gray-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-gray-200 bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-4 py-3 font-medium">{t("columns.when")}</th>
              <th className="px-4 py-3 font-medium">{t("columns.patient")}</th>
              <th className="px-4 py-3 font-medium">{t("columns.caregiver")}</th>
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
            ) : visits.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-gray-400">
                  {t("empty")}
                </td>
              </tr>
            ) : (
              visits.map((visit) => (
                <tr key={visit.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-900">{formatDateTime(visit.scheduledAt, locale)}</td>
                  <td className="px-4 py-3 font-medium text-gray-900">
                    {visit.patient.lastName}, {visit.patient.firstName}
                    {visit.isEmergency ? (
                      <span className="ml-2 rounded bg-red-100 px-1.5 py-0.5 text-xs font-medium text-red-800">
                        {t("emergency")}
                      </span>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 text-gray-600">{caregiverName(visit)}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[visit.status]}`}
                    >
                      {t(`status.${visit.status}`)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {CANCELABLE.includes(visit.status) ? (
                      <button
                        type="button"
                        onClick={() => void onCancel(visit.id)}
                        className="text-sm font-medium text-red-600 underline-offset-2 hover:underline"
                      >
                        {t("actions.cancel")}
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
