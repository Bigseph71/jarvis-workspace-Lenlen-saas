"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { acknowledgeIncident, openIncidents, type OpenIncident } from "@len-len/api-client";
import { Link } from "@/i18n/navigation";

/**
 * Offene Vorfälle der Organisation, als Arbeitsliste über der Besuchstabelle.
 *
 * Anders als die Wochen-Alerte darüber trägt diese Warnung einen TEXT, den
 * jemand lesen muss – eine Zeile mit Namen würde hier nichts nützen. Deshalb
 * die vollständige Notiz und ein Knopf, mit dem die Meldung geschlossen wird.
 *
 * Der Knopf ist der eigentliche Punkt: eine Warnung, die sich nicht schliessen
 * lässt, steht nach zwei Wochen dauerhaft auf dem Bildschirm und wird
 * überlesen. Dann ist sie schlimmer als keine.
 */
export function IncidentAlerts() {
  const t = useTranslations("visits.incidents");
  const locale = useLocale();

  const [incidents, setIncidents] = useState<OpenIncident[]>([]);
  const [total, setTotal] = useState(0);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await openIncidents({ pageSize: 20 });
      setIncidents(res.data);
      setTotal(res.total);
    } catch {
      // Still: die Besuchsseite ist ohne diese Liste weiter benutzbar, und ein
      // roter Balken für eine Nebenabfrage würde die echten Alarme entwerten.
      setIncidents([]);
      setTotal(0);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const onAcknowledge = useCallback(
    async (id: string) => {
      setBusyId(id);
      setError(null);
      try {
        await acknowledgeIncident(id);
        // Sofort aus der Liste nehmen, statt neu zu laden: die Antwort ist
        // bereits der Beweis, und ein Nachladen würde die Liste unter der Hand
        // des Nutzers umsortieren.
        setIncidents((prev) => prev.filter((i) => i.id !== id));
        setTotal((prev) => Math.max(0, prev - 1));
      } catch {
        setError(t("ackError"));
      } finally {
        setBusyId(null);
      }
    },
    [t],
  );

  if (incidents.length === 0) return null;

  const formatDateTime = (iso: string) =>
    new Date(iso).toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" });

  return (
    <section
      data-testid="incident-alerts"
      className="mt-4 rounded-lg border border-amber-300 bg-amber-50 p-4"
    >
      <h2 className="text-sm font-semibold text-amber-900">{t("title", { count: total })}</h2>

      {error ? (
        <p role="alert" className="mt-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      <ul className="mt-3 space-y-2">
        {incidents.map((i) => (
          <li key={i.id} className="rounded-md border border-amber-200 bg-white p-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-900">
                  <Link
                    href={`/patients/${i.patient.id}`}
                    className="underline-offset-2 hover:underline"
                  >
                    {i.patient.lastName}, {i.patient.firstName}
                  </Link>
                  {i.isEmergency ? (
                    <span className="ml-2 rounded-full bg-red-100 px-1.5 py-0.5 text-xs font-medium text-red-800">
                      {t("emergency")}
                    </span>
                  ) : null}
                </p>
                <p className="mt-0.5 text-xs text-gray-500">
                  {formatDateTime(i.scheduledAt)}
                  {i.caregiver
                    ? ` · ${t("byCaregiver", {
                        name: `${i.caregiver.lastName}, ${i.caregiver.firstName}`,
                      })}`
                    : ""}
                </p>
              </div>

              <button
                type="button"
                onClick={() => void onAcknowledge(i.id)}
                disabled={busyId === i.id}
                className="shrink-0 rounded-md border border-amber-400 bg-white px-3 py-1.5 text-sm font-medium text-amber-900 transition hover:bg-amber-100 disabled:opacity-50"
              >
                {t("acknowledge")}
              </button>
            </div>

            {/* whitespace-pre-line: die Fachkraft tippt auf dem Telefon in
                Zeilen, und diese Gliederung ist Teil der Aussage. */}
            <p className="mt-2 whitespace-pre-line text-sm text-gray-900">{i.visitNote}</p>
          </li>
        ))}
      </ul>

      {total > incidents.length ? (
        <p className="mt-2 text-xs text-amber-800">
          {t("more", { count: total - incidents.length })}
        </p>
      ) : null}
    </section>
  );
}
