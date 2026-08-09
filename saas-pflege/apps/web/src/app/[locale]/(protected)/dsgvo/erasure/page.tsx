"use client";

import { useCallback, useState } from "react";
import { useTranslations } from "next-intl";
import {
  eraseCaregiver,
  erasePatient,
  type CaregiverErasureReport,
  type PatientErasureReport,
  type SubjectKind,
} from "@len-len/api-client";
import { SubjectPicker, type Subject } from "@/components/subject-picker";

type Report =
  | ({ kind: "patient" } & PatientErasureReport)
  | ({ kind: "caregiver" } & CaregiverErasureReport);

/**
 * Löschverlangen nach DSGVO Art. 17.
 *
 * Der Vorgang ist NICHT umkehrbar, deshalb zwei Hürden vor der Ausführung:
 * die Person muss gewählt UND ihr Nachname abgetippt werden. Ein Häkchen wäre
 * zu leicht versehentlich gesetzt; das Abtippen erzwingt den Blick auf den
 * Namen, den man gleich entfernt.
 */
export default function DsgvoErasurePage() {
  const t = useTranslations("dsgvo.erasure");

  const [kind, setKind] = useState<SubjectKind>("patient");
  const [subject, setSubject] = useState<Subject | null>(null);
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Nachname der gewählten Person: "Muster, Erika" -> "Muster".
  const expected = subject?.name.split(",")[0]?.trim() ?? "";
  const confirmed = expected.length > 0 && confirmation.trim() === expected;

  const onSelect = useCallback((next: Subject | null) => {
    setSubject(next);
    setConfirmation("");
    setReport(null);
    setError(null);
  }, []);

  const onErase = useCallback(async () => {
    if (!subject || !confirmed) return;
    setBusy(true);
    setError(null);
    try {
      const result =
        subject.kind === "patient"
          ? ({ kind: "patient", ...(await erasePatient(subject.id)) } as const)
          : ({ kind: "caregiver", ...(await eraseCaregiver(subject.id)) } as const);
      setReport(result);
      // Auswahl auflösen: derselbe Datensatz darf nicht versehentlich ein
      // zweites Mal abgeschickt werden.
      setSubject(null);
      setConfirmation("");
    } catch {
      setError(t("error"));
    } finally {
      setBusy(false);
    }
  }, [subject, confirmed, t]);

  return (
    <section className="max-w-2xl">
      <h1 className="text-2xl font-bold text-gray-900">{t("title")}</h1>
      <p className="mt-1 text-sm text-gray-600">{t("subtitle")}</p>

      <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-3">
        <h2 className="font-medium text-amber-900">{t("warning.title")}</h2>
        <p className="mt-1 text-sm text-amber-800">{t("warning.body")}</p>
      </div>

      <div className="mt-6 rounded-lg border border-gray-200 bg-white p-4">
        <fieldset>
          <legend className="text-sm font-medium text-gray-700">{t("kind.label")}</legend>
          <div className="mt-2 flex gap-2">
            {(["patient", "caregiver"] as const).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setKind(k)}
                aria-pressed={kind === k}
                className={`rounded-md border px-4 py-2 text-sm font-medium transition ${
                  kind === k
                    ? "border-gray-900 bg-gray-900 text-white"
                    : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
                }`}
              >
                {t(`kind.${k}`)}
              </button>
            ))}
          </div>
        </fieldset>

        {/* Was tatsächlich geschieht – je nach Art verschieden, und beim
            Patienten sogar je nach Aufbewahrungsfrist. Vor der Auswahl
            erklärt, nicht erst im Ergebnis. */}
        <div className="mt-4 rounded-md border border-gray-200 bg-gray-50 px-3 py-3">
          <h2 className="text-xs font-medium uppercase tracking-wide text-gray-500">
            {t("effect.title")}
          </h2>
          <p className="mt-1 text-sm text-gray-700">
            {t(kind === "patient" ? "effect.patient" : "effect.caregiver")}
          </p>
        </div>

        <div className="mt-4">
          <SubjectPicker kind={kind} selected={subject} onSelect={onSelect} />
        </div>

        {subject ? (
          <div className="mt-4">
            <label htmlFor="confirm" className="block text-sm font-medium text-gray-700">
              {t("confirm.label", { name: expected })}
            </label>
            <input
              id="confirm"
              type="text"
              value={confirmation}
              onChange={(e) => setConfirmation(e.target.value)}
              autoComplete="off"
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:outline-none"
            />
            <p className="mt-1 text-xs text-gray-500">{t("confirm.hint")}</p>
          </div>
        ) : null}

        {error ? <p className="mt-4 text-sm text-red-600">{error}</p> : null}

        <button
          type="button"
          disabled={!confirmed || busy}
          onClick={() => void onErase()}
          className="mt-4 w-full rounded-md bg-red-700 px-4 py-2 text-sm font-medium text-white transition hover:bg-red-800 disabled:opacity-40"
        >
          {busy ? t("busy") : t("action")}
        </button>
      </div>

      {report ? <ReportPanel report={report} /> : null}
    </section>
  );
}

/**
 * Ergebnisbericht. Nennt ausdrücklich auch, was ERHALTEN bleibt: eine Löschung,
 * die dazu schweigt, wirkt unvollständig statt begründet begrenzt.
 */
function ReportPanel({ report }: { report: Report }) {
  const t = useTranslations("dsgvo.erasure.report");

  const restricted = report.kind === "patient" && report.outcome === "restricted";
  const dateFmt = (iso: string): string => new Date(iso).toLocaleDateString();

  return (
    <div
      className={`mt-6 rounded-lg border p-4 ${
        restricted ? "border-amber-200 bg-amber-50" : "border-green-200 bg-green-50"
      }`}
    >
      <h2 className={`font-medium ${restricted ? "text-amber-900" : "text-green-900"}`}>
        {t(restricted ? "restrictedTitle" : "anonymizedTitle")}
      </h2>

      {report.kind === "patient" ? (
        <p className={`mt-1 text-sm ${restricted ? "text-amber-800" : "text-green-800"}`}>
          {restricted
            ? t("restrictedBody", {
                date: dateFmt(report.anonymizableFrom),
                years: report.retentionYears,
              })
            : t("anonymizedBody")}
        </p>
      ) : (
        <p className="mt-1 text-sm text-green-800">
          {t("caregiverBody", {
            positions: report.deleted.gpsPositions,
            consents: report.deleted.gpsConsents,
            sessions: report.deleted.refreshTokens,
          })}
        </p>
      )}

      <h3 className="mt-3 text-xs font-medium uppercase tracking-wide text-gray-500">
        {t("retained")}
      </h3>
      <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm text-gray-700">
        {report.retained.map((r) => (
          <li key={r}>{r}</li>
        ))}
      </ul>
    </div>
  );
}
