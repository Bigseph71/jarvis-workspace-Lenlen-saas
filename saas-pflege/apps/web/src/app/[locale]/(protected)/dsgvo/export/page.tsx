"use client";

import { useCallback, useState } from "react";
import { useTranslations } from "next-intl";
import { downloadExport, type SubjectKind } from "@len-len/api-client";
import { SubjectPicker, type Subject } from "@/components/subject-picker";
import { useAuth } from "@/lib/auth/auth-context";

/**
 * Datenauskunft nach DSGVO Art. 15 / 20.
 *
 * Der Pflegedienst ist Verantwortlicher, diese Plattform Auftragsverarbeiter:
 * die Auskunft wird hier nicht beantwortet, sondern erzeugt, damit die
 * Organisation ihrer eigenen Pflicht nachkommen kann.
 *
 * Rein lesend, daher ohne Bestätigungsschritt – anders als die Löschung.
 */
export default function DsgvoExportPage() {
  const t = useTranslations("dsgvo.export");
  const { user } = useAuth();

  // HR ist laut RBAC von Patientendaten ausgeschlossen – auch von deren
  // Auskunft (export.routes.ts: canExportPatient). Die Auswahl gar nicht erst
  // anzubieten ist ehrlicher, als sie in einen 403 laufen zu lassen; die
  // Patientensuche wäre für diese Rolle ohnehin schon gescheitert.
  const mayExportPatients = user?.role !== "HR";

  const [kind, setKind] = useState<SubjectKind>(mayExportPatients ? "patient" : "caregiver");
  const [subject, setSubject] = useState<Subject | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onDownload = useCallback(async () => {
    if (!subject) return;
    setBusy(true);
    setError(null);
    setDone(false);
    try {
      await downloadExport(subject.kind, subject.id);
      setDone(true);
    } catch {
      setError(t("error"));
    } finally {
      setBusy(false);
    }
  }, [subject, t]);

  const onSelect = useCallback((next: Subject | null) => {
    setSubject(next);
    setDone(false);
  }, []);

  return (
    <section className="max-w-2xl">
      <h1 className="text-2xl font-bold text-gray-900">{t("title")}</h1>
      <p className="mt-1 text-sm text-gray-600">{t("subtitle")}</p>

      <div className="mt-6 rounded-lg border border-gray-200 bg-white p-4">
        <fieldset>
          <legend className="text-sm font-medium text-gray-700">{t("kind.label")}</legend>
          <div className="mt-2 flex gap-2">
            {(mayExportPatients ? (["patient", "caregiver"] as const) : (["caregiver"] as const)).map((k) => (
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

        <div className="mt-4">
          <SubjectPicker kind={kind} selected={subject} onSelect={onSelect} />
        </div>

        {/* Was die Datei enthält und was bewusst fehlt – vor dem Download, nicht
            danach: wer eine Auskunft weitergibt, muss wissen, was er weitergibt. */}
        <div className="mt-4 rounded-md border border-gray-200 bg-gray-50 px-3 py-3">
          <h2 className="text-xs font-medium uppercase tracking-wide text-gray-500">
            {t("contents.title")}
          </h2>
          <p className="mt-1 text-sm text-gray-700">
            {t(kind === "patient" ? "contents.patient" : "contents.caregiver")}
          </p>
          <p className="mt-2 text-sm text-gray-600">{t("contents.excluded")}</p>
        </div>

        {error ? <p className="mt-4 text-sm text-red-600">{error}</p> : null}
        {done ? (
          <p className="mt-4 rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">
            {t("done")}
          </p>
        ) : null}

        <button
          type="button"
          disabled={!subject || busy}
          onClick={() => void onDownload()}
          className="mt-4 w-full rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-gray-700 disabled:opacity-40"
        >
          {busy ? t("busy") : t("action")}
        </button>
      </div>
    </section>
  );
}
