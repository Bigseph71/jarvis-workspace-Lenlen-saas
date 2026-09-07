"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { IncidentAlerts } from "@/components/incident-alerts";
import { addDays, formatDate, formatDateTime, startOfWeek } from "@/lib/datetime";
import {
  ApiError,
  assignVisitCaregiver,
  cancelVisit,
  rescheduleVisit,
  listCaregivers,
  listVisits,
  missingWeek,
  type Caregiver,
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

// Dieselben Status, die das Backend für eine Neuzuweisung zulässt
// (assignCaregiver lehnt COMPLETED und CANCELED ab).
const ASSIGNABLE: VisitStatus[] = ["PLANNED", "IN_PROGRESS"];

/**
 * Ein Besuch ohne effektive Fachkraft steht in keiner Tagesroute – die
 * Mobile-App filtert auf caregiverId. Praktisch trifft das nur Notfälle: der
 * Regelbesuch bekommt beim Anlegen immer eine. Ein solcher Besuch ist geplant
 * und trotzdem niemandem zugeteilt, deshalb wird er oben eigens gemeldet.
 */
function needsCaregiver(visit: Visit): boolean {
  return visit.caregiver === null && ASSIGNABLE.includes(visit.status);
}

/** Was gerade bearbeitet wird. `null`, solange die Tabelle nur gelesen wird. */
interface EditDraft {
  id: string;
  /** Wert des datetime-local-Feldes, also LOKALE Zeit ohne Zone. */
  scheduledAt: string;
  caregiverId: string;
}

/**
 * ISO-Zeitstempel -> Wert fuer <input type="datetime-local">.
 *
 * `toISOString().slice(0, 16)` waere falsch: es liefert UTC, und das Feld
 * versteht seinen Wert als LOKALE Zeit. Ein Besuch um 9 Uhr deutscher Zeit
 * erschiene im Sommer als 7 Uhr -- und wer speicherte, verschoebe ihn
 * tatsaechlich um zwei Stunden.
 */
function toLocalInput(iso: string): string {
  const date = new Date(iso);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

export default function VisitsPage() {
  const t = useTranslations("visits");
  const locale = useLocale();

  const [weekStart, setWeekStart] = useState<Date>(() => startOfWeek(new Date()));
  const [status, setStatus] = useState<VisitStatus | "ALL">("ALL");

  const [visits, setVisits] = useState<Visit[]>([]);
  const [state, setState] = useState<LoadState>("loading");
  const [alerts, setAlerts] = useState<MissingWeekResult | null>(null);
  const [caregivers, setCaregivers] = useState<Caregiver[]>([]);
  const [assignError, setAssignError] = useState<string | null>(null);
  const [editing, setEditing] = useState<EditDraft | null>(null);
  const [editError, setEditError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

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

  // Für die Nachzuweisung offener Notfälle; unabhängig von der Wochenauswahl.
  useEffect(() => {
    let active = true;
    listCaregivers({ pageSize: 100 })
      .then((res) => {
        if (active) setCaregivers(res.data);
      })
      .catch(() => {
        /* Ohne Liste bleibt nur die Meldung oben – besser als eine leere Seite. */
      });
    return () => {
      active = false;
    };
  }, []);

  const unassigned = useMemo(() => visits.filter(needsCaregiver), [visits]);

  async function onCancel(id: string) {
    try {
      await cancelVisit(id);
      load();
    } catch {
      /* Stille Wiederholung über erneutes Laden würde nichts ändern; ignoriert. */
    }
  }

  /**
   * Eine geplante Visite bearbeiten.
   *
   * NUR bei PLANNED: ein begonnener Besuch hat einen Ankunftszeitpunkt, und
   * ihn nachtraeglich zu verschieben hiesse, die Dokumentation von der
   * Wirklichkeit zu loesen. Ein abgeschlossener erst recht nicht.
   *
   * Beide Aenderungen gehen an ZWEI Endpunkte (Termin und Fachkraft sind im
   * Backend getrennte Vorgaenge mit je eigenen Regeln). Deshalb der Termin
   * zuerst: scheitert er, bleibt auch die Fachkraft unveraendert, und der
   * Besuch steht so da wie vorher. Umgekehrt bliebe eine halb angewandte
   * Aenderung stehen.
   */
  function startEdit(visit: Visit) {
    setEditError(null);
    setEditing({
      id: visit.id,
      // datetime-local erwartet lokale Zeit ohne Zone; toISOString waere UTC
      // und verschoebe den angezeigten Termin um den Zonenversatz.
      scheduledAt: toLocalInput(visit.scheduledAt),
      caregiverId: visit.caregiver?.id ?? "",
    });
  }

  async function onSaveEdit(visit: Visit) {
    if (!editing) return;
    setEditError(null);
    setSaving(true);
    try {
      const nextIso = new Date(editing.scheduledAt).toISOString();
      if (nextIso !== visit.scheduledAt) {
        await rescheduleVisit(visit.id, nextIso);
      }
      if (editing.caregiverId && editing.caregiverId !== visit.caregiver?.id) {
        await assignVisitCaregiver(visit.id, editing.caregiverId);
      }
      setEditing(null);
      load();
    } catch (err) {
      // Die Meldung des Backends WEITERREICHEN und nicht durch eine eigene
      // ersetzen: sie nennt die belegte Uhrzeit, die fehlende Qualifikation
      // oder den freien Tag. Eine Sammelmeldung zwaenge zum Raten.
      setEditError(err instanceof ApiError ? err.message : t("editError"));
    } finally {
      setSaving(false);
    }
  }

  async function onAssign(visitId: string, caregiverId: string) {
    if (!caregiverId) return;
    setAssignError(null);
    try {
      await assignVisitCaregiver(visitId, caregiverId);
      load();
    } catch {
      setAssignError(t("assignError"));
    }
  }

  /**
   * Nur die effektive Fachkraft. Der frühere Rückfall auf assignedCaregiver
   * zeigte bei einem Notfall die Stamm-Fachkraft des Patienten an – jemanden
   * also, der den Besuch nie zu sehen bekommt, weil die Tagesroute auf der
   * effektiven Fachkraft steht.
   */
  function caregiverName(visit: Visit): string {
    const c = visit.caregiver;
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

      {/* Notfälle ohne Fachkraft: geplant, aber in keiner Tagesroute */}
      {unassigned.length > 0 ? (
        <div
          data-testid="unassigned-alert"
          className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
        >
          <span className="font-medium">{t("unassignedTitle", { count: unassigned.length })}</span>{" "}
          {t("unassignedHint")}
        </div>
      ) : null}

      {assignError ? (
        <p role="alert" className="mt-4 text-sm text-red-600">
          {assignError}
        </p>
      ) : null}

      {/* Der Text kommt vom Backend und nennt den Grund beim Namen: die belegte
          Uhrzeit, den freien Tag, die fehlende Qualifikation. */}
      {editError ? (
        <p role="alert" className="mt-4 text-sm text-red-600">
          {editError}
        </p>
      ) : null}

      {/* Gemeldete Vorfälle zuerst: ein Vorfall ist eine Beobachtung am
          Patienten, ein fehlender Wochenbesuch eine Lücke im Plan. */}
      <IncidentAlerts />

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
                  <td className="px-4 py-3 text-gray-900">
                    {editing?.id === visit.id ? (
                      <input
                        type="datetime-local"
                        aria-label={t("editDateLabel")}
                        value={editing.scheduledAt}
                        onChange={(e) =>
                          setEditing({ ...editing, scheduledAt: e.target.value })
                        }
                        className="rounded-md border border-gray-300 bg-white px-2 py-1 text-sm text-gray-900 focus:border-gray-900 focus:outline-none"
                      />
                    ) : (
                      formatDateTime(visit.scheduledAt, locale)
                    )}
                  </td>
                  <td className="px-4 py-3 font-medium text-gray-900">
                    {visit.patient.lastName}, {visit.patient.firstName}
                    {visit.isEmergency ? (
                      <span className="ml-2 rounded bg-red-100 px-1.5 py-0.5 text-xs font-medium text-red-800">
                        {t("emergency")}
                      </span>
                    ) : null}
                    {/* Das Motiv ist der Grund, warum dieser Besuch ausserhalb
                        des Zyklus steht – es gehört neben den Besuch, nicht nur
                        ins Audit-Log. */}
                    {visit.emergencyReason ? (
                      <p className="mt-0.5 text-xs font-normal text-gray-500">
                        {t("reasonPrefix")} {visit.emergencyReason}
                      </p>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {editing?.id === visit.id ? (
                      <select
                        aria-label={t("editCaregiverLabel")}
                        value={editing.caregiverId}
                        onChange={(e) => setEditing({ ...editing, caregiverId: e.target.value })}
                        className="rounded-md border border-gray-300 bg-white px-2 py-1 text-sm text-gray-900 focus:border-gray-900 focus:outline-none"
                      >
                        <option value="">{t("assignChoose")}</option>
                        {caregivers.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.lastName}, {c.firstName}
                          </option>
                        ))}
                      </select>
                    ) : needsCaregiver(visit) ? (
                      <select
                        aria-label={t("assignLabel")}
                        value=""
                        onChange={(e) => void onAssign(visit.id, e.target.value)}
                        className="rounded-md border border-red-300 bg-white px-2 py-1 text-sm text-gray-900 focus:border-gray-900 focus:outline-none"
                      >
                        <option value="">{t("assignChoose")}</option>
                        {caregivers.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.lastName}, {c.firstName}
                          </option>
                        ))}
                      </select>
                    ) : (
                      caregiverName(visit)
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[visit.status]}`}
                    >
                      {t(`status.${visit.status}`)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {editing?.id === visit.id ? (
                      <span className="flex justify-end gap-3">
                        <button
                          type="button"
                          disabled={saving}
                          onClick={() => void onSaveEdit(visit)}
                          className="text-sm font-medium text-gray-900 underline-offset-2 hover:underline disabled:opacity-50"
                        >
                          {t("actions.save")}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setEditing(null);
                            setEditError(null);
                          }}
                          className="text-sm font-medium text-gray-500 underline-offset-2 hover:underline"
                        >
                          {t("actions.abort")}
                        </button>
                      </span>
                    ) : (
                      <span className="flex justify-end gap-3">
                        {/* Nur PLANNED: ein begonnener Besuch hat bereits einen
                            Ankunftszeitpunkt, ein abgeschlossener eine
                            Dokumentation. Beide nachtraeglich zu verschieben
                            loeste die Akte von der Wirklichkeit. */}
                        {visit.status === "PLANNED" ? (
                          <button
                            type="button"
                            onClick={() => startEdit(visit)}
                            className="text-sm font-medium text-gray-900 underline-offset-2 hover:underline"
                          >
                            {t("actions.edit")}
                          </button>
                        ) : null}
                        {CANCELABLE.includes(visit.status) ? (
                          <button
                            type="button"
                            onClick={() => void onCancel(visit.id)}
                            className="text-sm font-medium text-red-600 underline-offset-2 hover:underline"
                          >
                            {t("actions.cancel")}
                          </button>
                        ) : null}
                      </span>
                    )}
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
