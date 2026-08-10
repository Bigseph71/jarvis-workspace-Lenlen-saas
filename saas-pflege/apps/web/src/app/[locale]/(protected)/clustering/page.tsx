"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import {
  ApiError,
  clusteringSocketUrl,
  computeDailyClustering,
  isClusteringQueued,
  optimizeRoute,
  type Cluster,
  type ClusteredPatient,
  type ClusteringJobStatus,
  type ClusteringSocketMessage,
  type DailyClusteringResult,
} from "@len-len/api-client";
import { getAccessToken } from "@/lib/auth/tokens";
import { ClusterMap, clusterColor } from "@/components/cluster-map";

type Decision = "pending" | "accepted" | "rejected";
type LoadState = "idle" | "loading" | "queued" | "ready" | "error";

/** Heute im lokalen Kalender, als YYYY-MM-DD für das Datumsfeld. */
function today(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

export default function ClusteringPage() {
  const t = useTranslations("clustering");
  // Über next-intl und nicht über toLocaleString(): letzteres richtet sich nach
  // der Umgebung des Prozesses, nicht nach der angezeigten Sprache. Eine
  // deutsche Oberfläche zeigte damit je nach Rechner "1,42" oder "1.42".
  const format = useFormatter();

  const [date, setDate] = useState(today);
  const [algorithm, setAlgorithm] = useState<"dbscan" | "kmeans">("dbscan");
  const [k, setK] = useState(4);

  const [result, setResult] = useState<DailyClusteringResult | null>(null);
  const [state, setState] = useState<LoadState>("idle");
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [errorStatus, setErrorStatus] = useState<number | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<ClusteringJobStatus | null>(null);

  /** Entscheidung je Gebiet, nach Index. Rein clientseitig – siehe unten. */
  const [decisions, setDecisions] = useState<Record<number, Decision>>({});
  /** Manuelle Verschiebungen: Patient -> Gebietsindex (null = herausgenommen). */
  const [moved, setMoved] = useState<Record<string, number | null>>({});

  const [vrptwState, setVrptwState] = useState<"idle" | "running" | "done" | "error">("idle");
  const socketRef = useRef<WebSocket | null>(null);

  // ── Berechnung ──────────────────────────────────────────────────────────

  const closeSocket = useCallback(() => {
    socketRef.current?.close();
    socketRef.current = null;
  }, []);

  const applyResult = useCallback((next: DailyClusteringResult) => {
    setResult(next);
    setDecisions({});
    setMoved({});
    setVrptwState("idle");
    setState("ready");
  }, []);

  /**
   * Verbindet den Statusstrom, wenn der Tag zu groß für die synchrone
   * Berechnung war. Ohne ihn müsste der Koordinator raten, ob noch gerechnet
   * wird oder ob etwas hängt.
   */
  const listen = useCallback(
    (forDate: string) => {
      const token = getAccessToken();
      if (!token) return;
      closeSocket();

      const ws = new WebSocket(clusteringSocketUrl(token, forDate));
      socketRef.current = ws;

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data as string) as ClusteringSocketMessage;
          if (message.type !== "status") return;
          setJobStatus(message.status);
          if (message.status === "done" && message.result) {
            applyResult(message.result);
            closeSocket();
          }
          if (message.status === "failed") {
            setState("error");
            setErrorCode(null);
            setErrorMessage(message.error ?? null);
            closeSocket();
          }
        } catch {
          /* Ungültige Nachricht ignorieren. */
        }
      };
      ws.onerror = () => setJobStatus("unknown");
    },
    [applyResult, closeSocket],
  );

  useEffect(() => closeSocket, [closeSocket]);

  const run = useCallback(async () => {
    setState("loading");
    setErrorCode(null);
    setErrorStatus(null);
    setErrorMessage(null);
    setJobStatus(null);
    try {
      const response = await computeDailyClustering({
        date,
        algorithm,
        ...(algorithm === "kmeans" ? { k } : {}),
      });
      if (isClusteringQueued(response)) {
        setState("queued");
        setJobStatus("pending");
        listen(date);
        return;
      }
      applyResult(response);
    } catch (err) {
      setState("error");
      setErrorCode(err instanceof ApiError ? (err.code ?? null) : null);
      setErrorStatus(err instanceof ApiError ? err.status : null);
      setErrorMessage(err instanceof Error ? err.message : null);
    }
  }, [algorithm, applyResult, date, k, listen]);

  // ── Abgeleiteter Zustand ────────────────────────────────────────────────

  /**
   * Gebiete nach Anwendung der manuellen Verschiebungen.
   *
   * Die Verschiebungen werden ÜBER das Ergebnis gelegt, statt es zu ersetzen:
   * so bleibt der Vorschlag des Servers erhalten und die Änderungen des
   * Koordinators lassen sich einzeln zurücknehmen.
   */
  const clusters: Cluster[] = useMemo(() => {
    if (!result) return [];
    if (Object.keys(moved).length === 0) return result.clusters;

    const buckets: ClusteredPatient[][] = result.clusters.map(() => []);
    const all = [...result.clusters.flatMap((c) => c.patients), ...result.unassigned];
    const originalIndex = new Map<string, number | null>();
    result.clusters.forEach((c, i) => c.patients.forEach((p) => originalIndex.set(p.patientId, i)));
    for (const p of result.unassigned) originalIndex.set(p.patientId, null);

    for (const patient of all) {
      const target =
        patient.patientId in moved ? moved[patient.patientId]! : originalIndex.get(patient.patientId)!;
      if (target !== null && buckets[target]) buckets[target]!.push(patient);
    }

    return result.clusters.map((cluster, index) => ({
      ...cluster,
      patients: buckets[index]!,
      patientCount: new Set(buckets[index]!.map((p) => p.patientId)).size,
    }));
  }, [result, moved]);

  const unassigned: ClusteredPatient[] = useMemo(() => {
    if (!result) return [];
    const inCluster = new Set(clusters.flatMap((c) => c.patients.map((p) => p.patientId)));
    const all = [...result.clusters.flatMap((c) => c.patients), ...result.unassigned];
    const seen = new Set<string>();
    return all.filter((p) => {
      if (inCluster.has(p.patientId) || seen.has(p.patientId)) return false;
      seen.add(p.patientId);
      return true;
    });
  }, [result, clusters]);

  const rejectedSet = useMemo(
    () => new Set(Object.entries(decisions).filter(([, d]) => d === "rejected").map(([i]) => Number(i))),
    [decisions],
  );

  const acceptedCount = useMemo(
    () => Object.values(decisions).filter((d) => d === "accepted").length,
    [decisions],
  );

  const decide = (index: number, decision: Decision): void =>
    setDecisions((prev) => ({ ...prev, [index]: decision }));

  const movePatient = useCallback((patientId: string, target: number | null): void => {
    setMoved((prev) => ({ ...prev, [patientId]: target }));
  }, []);

  // ── VRPTW ───────────────────────────────────────────────────────────────

  /**
   * Startet die Optimierung für die angenommenen Gebiete.
   *
   * Was hier NICHT passiert: die Gebiete werden nicht gespeichert. Es gibt
   * (noch) keine Tabelle dafür, und die Zuordnung Gebiet -> Tour ist eine
   * eigene Entscheidung. Die Optimierung läuft deshalb über die Touren, die für
   * diesen Tag bereits bestehen – für jede angenommene, mit einer Fachkraft
   * hinterlegte Gebietsempfehlung eine.
   */
  const acceptedRouteIds = useMemo(
    () =>
      clusters
        .filter((c) => decisions[c.index] === "accepted")
        .map((c) => c.routeId)
        .filter((id): id is string => id !== null),
    [clusters, decisions],
  );

  const launchVrptw = useCallback(async () => {
    setVrptwState("running");
    try {
      await Promise.all(acceptedRouteIds.map((routeId) => optimizeRoute(routeId)));
      setVrptwState("done");
    } catch {
      setVrptwState("error");
    }
  }, [acceptedRouteIds]);

  // ── Darstellung ─────────────────────────────────────────────────────────

  // Auf den STATUS geprüft, nicht auf den Fehlercode: 402 ist im ganzen
  // Produkt das Signal „der Plan reicht nicht“, und vier weitere Seiten
  // (Patient anlegen, Fachkraft anlegen, Fahrzeug anlegen/ändern) hängen genau
  // daran. Der Code bleibt als Feinheit erhalten, trägt aber nicht die
  // Entscheidung – sonst liefe diese Seite als einzige nach eigenen Regeln.
  const planBlocked = errorStatus === 402;
  const geocodingBlocked = errorCode === "GeocodingIncomplete";

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <h1 className="text-xl font-semibold text-gray-900">{t("title")}</h1>
      <p className="mt-1 text-sm text-gray-600">{t("intro")}</p>

      {/* ── Steuerung ── */}
      <div className="mt-5 flex flex-wrap items-end gap-3 rounded-lg border border-gray-200 bg-white p-4">
        <label className="flex flex-col text-sm">
          <span className="mb-1 text-gray-700">{t("fields.date")}</span>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="rounded-md border border-gray-300 px-2 py-1.5"
          />
        </label>

        <label className="flex flex-col text-sm">
          <span className="mb-1 text-gray-700">{t("fields.algorithm")}</span>
          <select
            value={algorithm}
            onChange={(e) => setAlgorithm(e.target.value as "dbscan" | "kmeans")}
            className="rounded-md border border-gray-300 px-2 py-1.5"
          >
            <option value="dbscan">{t("algorithms.dbscan")}</option>
            <option value="kmeans">{t("algorithms.kmeans")}</option>
          </select>
        </label>

        {algorithm === "kmeans" ? (
          <label className="flex flex-col text-sm">
            <span className="mb-1 text-gray-700">{t("fields.k")}</span>
            <input
              type="number"
              min={1}
              max={50}
              value={k}
              onChange={(e) => setK(Number(e.target.value))}
              className="w-24 rounded-md border border-gray-300 px-2 py-1.5"
            />
          </label>
        ) : null}

        <button
          type="button"
          onClick={run}
          disabled={state === "loading" || state === "queued"}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {state === "loading" ? t("actions.running") : t("actions.run")}
        </button>
      </div>

      {/* ── Status des asynchronen Laufs ── */}
      {state === "queued" || (jobStatus && jobStatus !== "done") ? (
        <p className="mt-4 rounded-md bg-blue-50 px-3 py-2 text-sm text-blue-800" role="status">
          {t(`jobStatus.${jobStatus ?? "pending"}`)}
        </p>
      ) : null}

      {/* ── Fehler ── */}
      {state === "error" ? (
        <div className="mt-4 rounded-md bg-red-50 px-3 py-3 text-sm text-red-800" role="alert">
          {planBlocked ? (
            <>
              <p className="font-medium">{t("errors.planTitle")}</p>
              <p className="mt-1">{t("errors.planBody")}</p>
            </>
          ) : geocodingBlocked ? (
            <>
              <p className="font-medium">{t("errors.geocodingTitle")}</p>
              <p className="mt-1">{errorMessage ?? t("errors.geocodingBody")}</p>
            </>
          ) : (
            <p>{errorMessage ?? t("errors.generic")}</p>
          )}
        </div>
      ) : null}

      {/* ── Ergebnis ── */}
      {state === "ready" && result ? (
        <>
          <div className="mt-5 grid gap-5 lg:grid-cols-[3fr_2fr]">
            <ClusterMap
              clusters={clusters}
              unassigned={unassigned}
              rejected={rejectedSet}
              onMovePatient={movePatient}
              labels={{ error: t("map.error"), noKey: t("map.noKey") }}
            />

            <div className="space-y-3">
              <p className="text-sm text-gray-600">
                {t("summary", { patients: result.patientCount, clusters: clusters.length })}
              </p>

              {clusters.length === 0 ? (
                <p className="rounded-md bg-gray-50 px-3 py-2 text-sm text-gray-600">{t("empty")}</p>
              ) : null}

              {clusters.map((cluster) => {
                const decision = decisions[cluster.index] ?? "pending";
                return (
                  <article
                    key={cluster.index}
                    data-testid={`cluster-${cluster.index}`}
                    className={`rounded-lg border p-3 ${
                      decision === "accepted"
                        ? "border-green-400 bg-green-50"
                        : decision === "rejected"
                          ? "border-gray-200 bg-gray-50 opacity-60"
                          : "border-gray-200 bg-white"
                    }`}
                  >
                    <header className="flex items-center gap-2">
                      <span
                        aria-hidden="true"
                        className="inline-block h-3 w-3 rounded-full"
                        style={{ backgroundColor: clusterColor(cluster.index) }}
                      />
                      <h2 className="text-sm font-medium text-gray-900">
                        {t("cluster.heading", { number: cluster.index + 1 })}
                      </h2>
                      {decision !== "pending" ? (
                        <span className="ml-auto text-xs text-gray-600">
                          {t(`cluster.${decision}`)}
                        </span>
                      ) : null}
                    </header>

                    <dl className="mt-2 space-y-1 text-xs text-gray-700">
                      <div className="flex justify-between">
                        <dt>{t("cluster.patients")}</dt>
                        <dd>{cluster.patientCount}</dd>
                      </div>
                      <div className="flex justify-between">
                        <dt>{t("cluster.maxDistance")}</dt>
                        <dd>{format.number(cluster.maxDistanceKm, { maximumFractionDigits: 2 })} km</dd>
                      </div>
                      <div className="flex justify-between gap-2">
                        <dt>{t("cluster.suggested")}</dt>
                        <dd className="text-right">
                          {cluster.suggestedCaregiver
                            ? `${cluster.suggestedCaregiver.firstName} ${cluster.suggestedCaregiver.lastName}`
                            : t("cluster.noSuggestion")}
                        </dd>
                      </div>
                    </dl>

                    {/* Verschieben ohne Maus: dieselbe Wirkung wie das Ziehen
                        eines Markers, nur per Tastatur erreichbar. */}
                    <ul className="mt-2 space-y-1">
                      {cluster.patients.map((patient) => (
                        <li key={patient.visitId} className="flex items-center gap-2 text-xs">
                          <span className="flex-1 truncate text-gray-800">
                            {patient.firstName} {patient.lastName}
                          </span>
                          <label className="sr-only" htmlFor={`move-${patient.visitId}`}>
                            {t("cluster.moveLabel", {
                              name: `${patient.firstName} ${patient.lastName}`,
                            })}
                          </label>
                          <select
                            id={`move-${patient.visitId}`}
                            value={cluster.index}
                            onChange={(e) =>
                              movePatient(
                                patient.patientId,
                                e.target.value === "" ? null : Number(e.target.value),
                              )
                            }
                            className="rounded border border-gray-300 px-1 py-0.5 text-xs"
                          >
                            {clusters.map((target) => (
                              <option key={target.index} value={target.index}>
                                {t("cluster.heading", { number: target.index + 1 })}
                              </option>
                            ))}
                            <option value="">{t("cluster.removeFromClusters")}</option>
                          </select>
                        </li>
                      ))}
                    </ul>

                    <div className="mt-3 flex gap-2">
                      <button
                        type="button"
                        onClick={() => decide(cluster.index, "accepted")}
                        disabled={decision === "accepted"}
                        className="rounded-md bg-green-600 px-2.5 py-1 text-xs font-medium text-white disabled:opacity-50"
                      >
                        {t("actions.accept")}
                      </button>
                      <button
                        type="button"
                        onClick={() => decide(cluster.index, "pending")}
                        className="rounded-md border border-gray-300 px-2.5 py-1 text-xs text-gray-700"
                      >
                        {t("actions.adjust")}
                      </button>
                      <button
                        type="button"
                        onClick={() => decide(cluster.index, "rejected")}
                        disabled={decision === "rejected"}
                        className="rounded-md border border-red-300 px-2.5 py-1 text-xs text-red-700 disabled:opacity-50"
                      >
                        {t("actions.reject")}
                      </button>
                    </div>
                  </article>
                );
              })}

              {unassigned.length > 0 ? (
                <article className="rounded-lg border border-gray-300 bg-gray-50 p-3" data-testid="unassigned">
                  <h2 className="text-sm font-medium text-gray-900">{t("unassigned.heading")}</h2>
                  <p className="mt-1 text-xs text-gray-600">{t("unassigned.hint")}</p>
                  <ul className="mt-2 space-y-0.5 text-xs text-gray-800">
                    {unassigned.map((patient) => (
                      <li key={patient.visitId}>
                        {patient.firstName} {patient.lastName}
                      </li>
                    ))}
                  </ul>
                </article>
              ) : null}
            </div>
          </div>

          {/* ── VRPTW ── */}
          <div className="mt-5 flex flex-wrap items-center gap-3 rounded-lg border border-gray-200 bg-white p-4">
            <button
              type="button"
              onClick={launchVrptw}
              disabled={acceptedCount === 0 || vrptwState === "running"}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {t("actions.launchVrptw")}
            </button>
            <p className="text-xs text-gray-600">
              {acceptedCount === 0
                ? t("vrptw.needsAcceptance")
                : t("vrptw.ready", { count: acceptedRouteIds.length })}
            </p>
            {/* Ein angenommenes Gebiet ohne bestehende Tour lässt sich nicht
                optimieren. Das schweigend zu übergehen wäre der schlimmste
                Fall: der Knopf reagierte, und nichts geschähe. */}
            {acceptedCount > 0 && acceptedRouteIds.length < acceptedCount ? (
              <p className="text-xs text-amber-700" role="status">
                {t("vrptw.missingRoutes", { count: acceptedCount - acceptedRouteIds.length })}
              </p>
            ) : null}
            {vrptwState === "done" ? (
              <p className="text-xs text-green-700" role="status">
                {t("vrptw.queued")}
              </p>
            ) : null}
            {vrptwState === "error" ? (
              <p className="text-xs text-red-700" role="alert">
                {t("vrptw.error")}
              </p>
            ) : null}
          </div>
        </>
      ) : null}
    </div>
  );
}
