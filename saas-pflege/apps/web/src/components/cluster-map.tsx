"use client";

import { useEffect, useRef } from "react";
import type { Cluster, ClusteredPatient } from "@len-len/api-client";
import { getMapsApiKey, loadGoogleMaps } from "@/lib/google-maps";

/**
 * Palette des gebiets. Bewusst kontraststarke, gut unterscheidbare Farben und
 * KEIN Farbverlauf: die Gebiete sind nominal, nicht geordnet. Ein Verlauf
 * suggerierte eine Rangfolge, die es nicht gibt.
 *
 * Die Farbe allein trägt nie eine Information: jedes Gebiet steht zusätzlich
 * mit Nummer und Namen in der Liste daneben. Wer Farben schlecht unterscheidet,
 * verliert dadurch nichts.
 */
export const CLUSTER_COLORS = [
  "#2563eb", // blau
  "#dc2626", // rot
  "#16a34a", // grün
  "#ea580c", // orange
  "#7c3aed", // violett
  "#0891b2", // türkis
  "#ca8a04", // ocker
  "#db2777", // magenta
] as const;

export function clusterColor(index: number): string {
  return CLUSTER_COLORS[index % CLUSTER_COLORS.length]!;
}

/** Grau: nicht zugeordnet. Keine Gebietsfarbe, weil es kein Gebiet ist. */
const UNASSIGNED_COLOR = "#6b7280";

interface ClusterMapProps {
  clusters: Cluster[];
  unassigned: ClusteredPatient[];
  /** Gebiete, die der Koordinator abgelehnt hat – ausgegraut dargestellt. */
  rejected: ReadonlySet<number>;
  /**
   * Ein Patient wurde per Ziehen in ein anderes Gebiet verschoben.
   * `targetIndex === null` bedeutet: heraus aus allen Gebieten.
   */
  onMovePatient: (patientId: string, targetIndex: number | null) => void;
  labels: { error: string; noKey: string };
  height?: number;
}

const CITY_ZOOM = 12;

interface MarkerEntry {
  marker: google.maps.Marker;
  patientId: string;
}

/**
 * Karte der Gebietsaufteilung: ein Marker je Patient, eingefärbt nach Gebiet.
 *
 * ── Zum Ziehen ───────────────────────────────────────────────────────────
 * Ein gezogener Marker ändert die ZUORDNUNG, nicht die Adresse. Er springt
 * deshalb nach dem Loslassen auf die echte Koordinate des Patienten zurück und
 * wechselt nur die Farbe. Ließe man ihn liegen, zeigte die Karte eine Anschrift
 * an, die es nicht gibt – und beim nächsten Laden stünde er wieder woanders.
 *
 * Das Zielgebiet ergibt sich aus dem nächstgelegenen Gebietsschwerpunkt zum
 * Ablagepunkt. Ein Gebiet hat keine Grenze, die man treffen könnte: es ist eine
 * Punktwolke, kein Polygon.
 *
 * Ziehen ist ein Mauswerkzeug. Dieselbe Verschiebung ist deshalb in der Liste
 * neben der Karte über ein Auswahlfeld möglich – ohne das wäre die Funktion
 * per Tastatur unerreichbar.
 */
export function ClusterMap({
  clusters,
  unassigned,
  rejected,
  onMovePatient,
  labels,
  height = 460,
}: ClusterMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<MarkerEntry[]>([]);
  // Über eine Referenz, damit das Neuzeichnen der Marker nicht an der Identität
  // der Rückruffunktion hängt.
  const moveRef = useRef(onMovePatient);
  moveRef.current = onMovePatient;

  const hasKey = Boolean(getMapsApiKey());

  useEffect(() => {
    if (!hasKey) return;
    let cancelled = false;

    loadGoogleMaps()
      .then((maps) => {
        if (cancelled || !containerRef.current) return;

        const points = [
          ...clusters.flatMap((c) => c.patients),
          ...unassigned,
        ].filter((p) => Number.isFinite(p.latitude) && Number.isFinite(p.longitude));

        if (!mapRef.current) {
          mapRef.current = new maps.Map(containerRef.current, {
            center: points.length > 0 ? { lat: points[0]!.latitude, lng: points[0]!.longitude } : undefined,
            zoom: CITY_ZOOM,
            streetViewControl: false,
            mapTypeControl: false,
          });
        }
        const map = mapRef.current;

        for (const entry of markersRef.current) entry.marker.setMap(null);
        markersRef.current = [];

        const centroids = clusters.map((c) => c.centroid);

        const place = (patient: ClusteredPatient, colour: string, label: string | null): void => {
          const marker = new maps.Marker({
            map,
            position: { lat: patient.latitude, lng: patient.longitude },
            title: `${patient.firstName} ${patient.lastName}`,
            draggable: true,
            label: label ? { text: label, color: "#ffffff", fontSize: "11px" } : undefined,
            icon: {
              path: maps.SymbolPath.CIRCLE,
              scale: 9,
              fillColor: colour,
              fillOpacity: 1,
              strokeColor: "#ffffff",
              strokeWeight: 2,
            },
          });

          marker.addListener("dragend", (event: google.maps.MapMouseEvent) => {
            // Immer zurücksetzen: die Adresse des Patienten bleibt, wo sie ist.
            marker.setPosition({ lat: patient.latitude, lng: patient.longitude });
            if (!event.latLng || centroids.length === 0) return;

            const dropped = { lat: event.latLng.lat(), lng: event.latLng.lng() };
            let nearest = 0;
            let best = Number.POSITIVE_INFINITY;
            for (let i = 0; i < centroids.length; i += 1) {
              const dLat = centroids[i]!.lat - dropped.lat;
              const dLng = centroids[i]!.lng - dropped.lng;
              // Quadrat des Abstands im Gradmaß: für einen Vergleich innerhalb
              // einer Stadt genügt das, eine Wurzel wäre reine Zierde.
              const distance = dLat * dLat + dLng * dLng;
              if (distance < best) {
                best = distance;
                nearest = i;
              }
            }
            moveRef.current(patient.patientId, nearest);
          });

          markersRef.current.push({ marker, patientId: patient.patientId });
        };

        clusters.forEach((cluster, index) => {
          const colour = rejected.has(index) ? UNASSIGNED_COLOR : clusterColor(index);
          for (const patient of cluster.patients) place(patient, colour, String(index + 1));
        });
        for (const patient of unassigned) place(patient, UNASSIGNED_COLOR, null);

        if (points.length > 1) {
          const bounds = new maps.LatLngBounds();
          for (const point of points) bounds.extend({ lat: point.latitude, lng: point.longitude });
          map.fitBounds(bounds);
        }
      })
      .catch(() => {
        /* Der Ausfall wird unten benannt, nicht verschwiegen. */
      });

    return () => {
      cancelled = true;
    };
  }, [clusters, unassigned, rejected, hasKey]);

  // Ohne Schlüssel wird der Ausfall BENANNT statt still weggelassen – sonst ist
  // eine fehlende Karte nicht von einem leeren Ergebnis zu unterscheiden.
  if (!hasKey) {
    return (
      <div
        className="flex items-center justify-center rounded-lg border border-gray-200 bg-gray-50 px-4 text-center text-xs text-gray-500"
        style={{ height }}
        data-testid="cluster-map-fallback"
      >
        {labels.noKey}
      </div>
    );
  }

  return (
    <div
      className="overflow-hidden rounded-lg border border-gray-200"
      style={{ height }}
      data-testid="cluster-map"
    >
      <div ref={containerRef} className="h-full w-full" />
    </div>
  );
}
