"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useTranslations, useLocale } from "next-intl";
import {
  getCaregiver,
  listVisits,
  type CaregiverDetail,
  type Visit,
} from "@len-len/api-client";
import { Link } from "@/i18n/navigation";

type LoadState = "loading" | "ready" | "error";

const VISIT_LIMIT = 20;

const VISIT_STATUS_STYLES: Record<Visit["status"], string> = {
  PLANNED: "bg-blue-100 text-blue-800",
  IN_PROGRESS: "bg-amber-100 text-amber-800",
  COMPLETED: "bg-green-100 text-green-800",
  MISSED: "bg-red-100 text-red-800",
  CANCELED: "bg-gray-200 text-gray-700",
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="py-2">
      <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</dt>
      <dd className="mt-0.5 text-sm text-gray-900">{children}</dd>
    </div>
  );
}

/**
 * Fachkraft-Akte: Stammdaten, Vertragsmomentaufnahme, App-Zugang und die
 * zuletzt geleisteten Besuche.
 *
 * Die Besuche werden über `caregiverId` geladen, also nach der TATSÄCHLICH
 * leistenden Kraft – bei einer Vertretung ist das nicht die zugeteilte
 * (Regel 4).
 */
export default function CaregiverDetailPage() {
  const t = useTranslations("caregivers.detail");
  const tc = useTranslations("caregivers");
  const tv = useTranslations("visits");
  const locale = useLocale();
  const params = useParams<{ id: string }>();
  const id = params.id;

  const [caregiver, setCaregiver] = useState<CaregiverDetail | null>(null);
  const [visits, setVisits] = useState<Visit[]>([]);
  const [visitsFailed, setVisitsFailed] = useState(false);
  const [state, setState] = useState<LoadState>("loading");

  useEffect(() => {
    let active = true;
    setState("loading");

    getCaregiver(id)
      .then((c) => {
        if (!active) return;
        setCaregiver(c);
        setState("ready");
      })
      .catch(() => {
        if (active) setState("error");
      });

    listVisits({ caregiverId: id, pageSize: VISIT_LIMIT })
      .then((res) => {
        if (!active) return;
        setVisits(res.data);
        setVisitsFailed(false);
      })
      .catch(() => {
        if (active) setVisitsFailed(true);
      });

    return () => {
      active = false;
    };
  }, [id]);

  const formatDateTime = useCallback(
    (iso: string) => new Date(iso).toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" }),
    [locale],
  );
  const formatDate = useCallback(
    (iso: string) => new Date(iso).toLocaleDateString(locale, { dateStyle: "medium" }),
    [locale],
  );

  if (state === "loading") return <p className="text-gray-400">{t("loading")}</p>;
  if (state === "error" || !caregiver) return <p className="text-red-600">{t("error")}</p>;

  return (
    <section className="max-w-3xl">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/caregivers" className="text-sm text-gray-500 underline-offset-2 hover:underline">
            {t("back")}
          </Link>
          <h1 className="mt-1 text-2xl font-bold text-gray-900">
            {caregiver.lastName}, {caregiver.firstName}
          </h1>
          <p className="text-sm text-gray-600">{tc(`qualifications.${caregiver.qualification}`)}</p>
        </div>
        <div className="flex gap-2">
          <Link
            href={`/caregivers/${caregiver.id}/contract`}
            className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-100"
          >
            {t("contract")}
          </Link>
          <Link
            href={`/caregivers/${caregiver.id}/edit`}
            className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-100"
          >
            {t("edit")}
          </Link>
        </div>
      </div>

      {caregiver.anonymizedAt ? (
        <div className="mt-4 rounded-md border border-gray-300 bg-gray-100 px-4 py-3">
          <h2 className="font-medium text-gray-900">{t("dsgvo.anonymizedTitle")}</h2>
          <p className="mt-1 text-sm text-gray-700">
            {t("dsgvo.anonymizedBody", { date: formatDate(caregiver.anonymizedAt) })}
          </p>
        </div>
      ) : !caregiver.isActive ? (
        <div className="mt-4 rounded-md border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-700">
          {caregiver.deactivatedAt
            ? t("inactiveSince", { date: formatDate(caregiver.deactivatedAt) })
            : t("inactive")}
        </div>
      ) : null}

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-gray-900">{t("contractTitle")}</h2>
          <dl className="mt-1 divide-y divide-gray-100">
            <Field label={tc("fields.contractType")}>
              {tc(`contractTypes.${caregiver.contractType}`)}
            </Field>
            <Field label={tc("fields.weeklyHours")}>{caregiver.weeklyHours}</Field>
            <Field label={tc("fields.workDays")}>
              {caregiver.workDays.length > 0 ? (
                caregiver.workDays.map((d) => tc(`weekdays.${d}`)).join(", ")
              ) : (
                <span className="text-gray-400">{t("none")}</span>
              )}
            </Field>
            <Field label={tc("fields.maxPatients")}>{caregiver.maxPatients}</Field>
          </dl>
        </div>

        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-gray-900">{t("accessTitle")}</h2>
          <dl className="mt-1 divide-y divide-gray-100">
            <Field label={t("account")}>
              {caregiver.user ? (
                <>
                  {caregiver.user.email}
                  {!caregiver.user.isActive ? (
                    <span className="ml-2 rounded-full bg-gray-200 px-1.5 py-0.5 text-xs text-gray-600">
                      {t("accountInactive")}
                    </span>
                  ) : null}
                </>
              ) : (
                // Ohne Konto keine mobile App – und damit auch kein Tracking.
                <span className="text-gray-400">{t("noAccount")}</span>
              )}
            </Field>
            <Field label={t("assignedPatients")}>{caregiver._count?.assignedPatients ?? 0}</Field>
            <Field label={t("createdAt")}>{formatDate(caregiver.createdAt)}</Field>
          </dl>
        </div>
      </div>

      <h2 className="mt-8 text-lg font-semibold text-gray-900">
        {t("visitsTitle", { count: visits.length })}
      </h2>
      <div className="mt-3 overflow-hidden rounded-lg border border-gray-200 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-gray-200 bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-4 py-3 font-medium">{t("visitDate")}</th>
                <th className="px-4 py-3 font-medium">{t("visitPatient")}</th>
                <th className="px-4 py-3 font-medium">{t("visitStatus")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {visitsFailed ? (
                <tr>
                  <td colSpan={3} className="px-4 py-8 text-center text-red-600">
                    {t("visitsError")}
                  </td>
                </tr>
              ) : visits.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-4 py-8 text-center text-gray-400">
                    {t("visitsEmpty")}
                  </td>
                </tr>
              ) : (
                visits.map((v) => (
                  <tr key={v.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-900">
                      {formatDateTime(v.scheduledAt)}
                      {v.isEmergency ? (
                        <span className="ml-2 rounded-full bg-red-100 px-1.5 py-0.5 text-xs font-medium text-red-800">
                          {t("emergency")}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      <Link
                        href={`/patients/${v.patientId}`}
                        className="underline-offset-2 hover:underline"
                      >
                        {v.patient.lastName}, {v.patient.firstName}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${VISIT_STATUS_STYLES[v.status]}`}
                      >
                        {tv(`status.${v.status}`)}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
