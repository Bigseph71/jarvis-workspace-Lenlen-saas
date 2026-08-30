"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useTranslations, useLocale } from "next-intl";
import {
  getPatient,
  listVisits,
  type PatientDetail,
  type Visit,
} from "@len-len/api-client";
import { Link } from "@/i18n/navigation";
import { PatientMap } from "@/components/patient-map";
import { PatientVisitNotes } from "@/components/patient-visit-notes";
import { useAuth } from "@/lib/auth/auth-context";
import { canReadVisitNotes } from "@/lib/auth/permissions";

type LoadState = "loading" | "ready" | "error";
type Tab = "overview" | "notes";

/** Anzahl der zuletzt angezeigten Besuche. */
const VISIT_LIMIT = 20;

const VISIT_STATUS_STYLES: Record<Visit["status"], string> = {
  PLANNED: "bg-blue-100 text-blue-800",
  IN_PROGRESS: "bg-amber-100 text-amber-800",
  COMPLETED: "bg-green-100 text-green-800",
  MISSED: "bg-red-100 text-red-800",
  CANCELED: "bg-gray-200 text-gray-700",
};

const GEO_STYLES: Record<PatientDetail["geocodingStatus"], string> = {
  VALID: "bg-green-100 text-green-800",
  PENDING: "bg-gray-200 text-gray-700",
  INVALID: "bg-red-100 text-red-800",
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
 * Patientenakte. Fasst zusammen, was bisher nur über die API erreichbar war:
 * Besuchshistorie, Geokodierung, Stamm-Fachkraft und DSGVO-Status.
 *
 * Der Aufruf von GET /patients/:id ist ein protokollierter Lesezugriff auf
 * Patientendaten – anders als die Liste, die nur Übersichtsfelder liefert.
 */
export default function PatientDetailPage() {
  const t = useTranslations("patients.detail");
  const tv = useTranslations("visits");
  // Die Geokodierungs-Labels stehen bereits unter patients.status (Liste).
  const tGeo = useTranslations("patients.status");
  const locale = useLocale();
  const params = useParams<{ id: string }>();
  const id = params.id;
  const { user } = useAuth();
  const mayReadNotes = canReadVisitNotes(user?.role);

  const [patient, setPatient] = useState<PatientDetail | null>(null);
  const [visits, setVisits] = useState<Visit[]>([]);
  const [visitsFailed, setVisitsFailed] = useState(false);
  const [state, setState] = useState<LoadState>("loading");
  const [tab, setTab] = useState<Tab>("overview");

  useEffect(() => {
    let active = true;
    setState("loading");

    // Getrennt behandelt: eine fehlgeschlagene Besuchsliste darf die Akte
    // nicht unbenutzbar machen.
    getPatient(id)
      .then((p) => {
        if (!active) return;
        setPatient(p);
        setState("ready");
      })
      .catch(() => {
        if (active) setState("error");
      });

    listVisits({ patientId: id, pageSize: VISIT_LIMIT })
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
  if (state === "error" || !patient) return <p className="text-red-600">{t("error")}</p>;

  const restricted = patient.erasureRequestedAt !== null && patient.anonymizedAt === null;

  return (
    <section className="max-w-3xl">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/patients" className="text-sm text-gray-500 underline-offset-2 hover:underline">
            {t("back")}
          </Link>
          <h1 className="mt-1 text-2xl font-bold text-gray-900">
            {patient.lastName}, {patient.firstName}
          </h1>
        </div>
        <Link
          href={`/patients/${patient.id}/edit`}
          className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-100"
        >
          {t("edit")}
        </Link>
      </div>

      {/* DSGVO zuerst: ein gesperrter Datensatz darf nicht so aussehen wie ein
          gewöhnlich deaktivierter. Der Unterschied entscheidet darüber, was mit
          ihm noch geschehen darf. */}
      {patient.anonymizedAt ? (
        <div className="mt-4 rounded-md border border-gray-300 bg-gray-100 px-4 py-3">
          <h2 className="font-medium text-gray-900">{t("dsgvo.anonymizedTitle")}</h2>
          <p className="mt-1 text-sm text-gray-700">
            {t("dsgvo.anonymizedBody", { date: formatDate(patient.anonymizedAt) })}
          </p>
        </div>
      ) : restricted ? (
        <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-3">
          <h2 className="font-medium text-amber-900">{t("dsgvo.restrictedTitle")}</h2>
          <p className="mt-1 text-sm text-amber-800">
            {t("dsgvo.restrictedBody", { date: formatDate(patient.erasureRequestedAt!) })}
          </p>
        </div>
      ) : null}

      {!patient.isActive && !restricted && !patient.anonymizedAt ? (
        <div className="mt-4 rounded-md border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-700">
          {t("inactive")}
        </div>
      ) : null}

      {/* Der Reiter erscheint nur, wenn die Rolle den Endpunkt auch aufrufen
          darf. Ein sichtbarer Reiter, der in 403 endet, ist schlechter als
          keiner: er behauptet ein Recht, das nicht besteht. */}
      {mayReadNotes ? (
        <div className="mt-6 flex gap-1 border-b border-gray-200" role="tablist">
          {(["overview", "notes"] as const).map((key) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={tab === key}
              onClick={() => setTab(key)}
              className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium transition ${
                tab === key
                  ? "border-blue-600 text-blue-700"
                  : "border-transparent text-gray-500 hover:text-gray-800"
              }`}
            >
              {t(`tabs.${key}`)}
            </button>
          ))}
        </div>
      ) : null}

      {tab === "notes" ? (
        <div className="mt-6">
          <PatientVisitNotes patientId={patient.id} />
        </div>
      ) : (
      <>
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-gray-900">{t("addressTitle")}</h2>
          <dl className="mt-1 divide-y divide-gray-100">
            <Field label={t("rawAddress")}>{patient.rawAddress}</Field>
            <Field label={t("normalizedAddress")}>
              {patient.normalizedAddress ?? <span className="text-gray-400">{t("none")}</span>}
            </Field>
            <Field label={t("geocoding")}>
              <span
                className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${GEO_STYLES[patient.geocodingStatus]}`}
              >
                {tGeo(patient.geocodingStatus)}
              </span>
              {patient.latitude && patient.longitude ? (
                <span className="ml-2 text-xs text-gray-500">
                  {Number(patient.latitude).toFixed(5)}, {Number(patient.longitude).toFixed(5)}
                  {patient.geocodingScore ? ` · ${t("score")} ${patient.geocodingScore}` : null}
                </span>
              ) : (
                <span className="ml-2 text-xs text-gray-400">{t("noCoordinates")}</span>
              )}
            </Field>
          </dl>

          {/* Nur bei VALID: bei PENDING gibt es noch keine Koordinaten, bei
              INVALID sind die vorhandenen nicht vertrauenswürdig – eine Karte
              würde dort einen Ort behaupten, den niemand geprüft hat. */}
          {patient.geocodingStatus === "VALID" && patient.latitude && patient.longitude ? (
            <PatientMap
              latitude={Number(patient.latitude)}
              longitude={Number(patient.longitude)}
              title={`${patient.lastName}, ${patient.firstName}`}
              labels={{ error: t("mapError"), noKey: t("mapNoKey") }}
            />
          ) : null}
        </div>

        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-gray-900">{t("careTitle")}</h2>
          <dl className="mt-1 divide-y divide-gray-100">
            <Field label={t("assignedCaregiver")}>
              {patient.assignedCaregiver ? (
                <Link
                  href={`/caregivers/${patient.assignedCaregiver.id}`}
                  className="underline-offset-2 hover:underline"
                >
                  {patient.assignedCaregiver.lastName}, {patient.assignedCaregiver.firstName}
                </Link>
              ) : (
                <span className="text-gray-400">{t("noCaregiver")}</span>
              )}
            </Field>
            <Field label={t("createdAt")}>{formatDate(patient.createdAt)}</Field>
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
                <th className="px-4 py-3 font-medium">{t("visitCaregiver")}</th>
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
                      {/* Wer geleistet hat, nicht wer zugeteilt war (Regel 4):
                          bei einer Vertretung sind das verschiedene Personen. */}
                      {v.caregiver ? `${v.caregiver.lastName}, ${v.caregiver.firstName}` : "—"}
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
      </>
      )}
    </section>
  );
}
