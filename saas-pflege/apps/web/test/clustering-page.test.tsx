import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { DailyClusteringResult } from "@len-len/api-client";
import { render, t } from "./helpers/render";

/**
 * Seite der täglichen Gebietsaufteilung.
 *
 * Geprüft wird das, was der Koordinator sieht und anklickt – nicht der
 * Algorithmus, der ohne Browser in clustering-dbscan.test.ts hängt. Die drei
 * Zusicherungen, die hier zählen:
 *
 *   1. Die Gebiete stehen mit Zahl, Ausdehnung und vorgeschlagener Fachkraft da.
 *      Eine Karte ohne diese Angaben wäre hübsch und unbrauchbar.
 *   2. Der VRPTW-Knopf bleibt gesperrt, solange nichts angenommen wurde. Sonst
 *      liefen Touren auf einem Vorschlag los, den niemand geprüft hat.
 *   3. Ein Basic-Tenant bekommt einen Satz, der erklärt, warum nichts passiert –
 *      statt einer rohen Fehlermeldung.
 */

// vi.mock wird an den Dateianfang gehoben; alles, was die Fabrik benutzt, muss
// über vi.hoisted mitgehoben werden, sonst greift sie auf noch nicht
// initialisierte Bindungen zu.
const { MockApiError, computeDailyClustering, optimizeRoute } = vi.hoisted(() => {
  class MockApiError extends Error {
    readonly status: number;
    readonly code: string;
    constructor(status: number, code: string, message: string) {
      super(message);
      this.status = status;
      this.code = code;
      this.name = "ApiError";
    }
  }
  return { MockApiError, computeDailyClustering: vi.fn(), optimizeRoute: vi.fn() };
});

vi.mock("@len-len/api-client", () => ({
  ApiError: MockApiError,
  computeDailyClustering: (...args: unknown[]) => computeDailyClustering(...args),
  optimizeRoute: (...args: unknown[]) => optimizeRoute(...args),
  isClusteringQueued: (res: Record<string, unknown>) => !("clusters" in res),
  clusteringSocketUrl: () => "ws://test/clustering",
}));

vi.mock("@/lib/auth/tokens", () => ({ getAccessToken: () => "test-token" }));

import ClusteringPage from "../src/app/[locale]/(protected)/clustering/page";

function patient(id: string, last: string, lat: number, lng: number) {
  return {
    patientId: id,
    visitId: `v-${id}`,
    firstName: "Test",
    lastName: last,
    latitude: lat,
    longitude: lng,
    scheduledAt: "2026-09-07T08:00:00.000Z",
    assignedCaregiverId: null,
  };
}

const RESULT: DailyClusteringResult = {
  date: "2026-09-07",
  algorithm: "dbscan",
  patientCount: 5,
  clusters: [
    {
      index: 0,
      patientCount: 3,
      maxDistanceKm: 1.42,
      centroid: { lat: 49.422, lng: 8.684 },
      patients: [
        patient("p1", "Nord", 49.4304, 8.6772),
        patient("p2", "Nord", 49.4192, 8.6873),
        patient("p3", "Nord", 49.418, 8.689),
      ],
      suggestedCaregiver: {
        id: "fk-nord",
        firstName: "Anna",
        lastName: "Nordpflege",
        qualification: "PFLEGEFACHKRAFT",
        distanceKm: 0.4,
      },
      routeId: "route-nord",
    },
    {
      index: 1,
      patientCount: 2,
      maxDistanceKm: 2.05,
      centroid: { lat: 49.378, lng: 8.691 },
      patients: [patient("p4", "Sued", 49.3771, 8.6808), patient("p5", "Sued", 49.3796, 8.7014)],
      suggestedCaregiver: {
        id: "fk-sued",
        firstName: "Markus",
        lastName: "Suedpflege",
        qualification: "PFLEGEFACHKRAFT",
        distanceKm: 0.9,
      },
      routeId: "route-sued",
    },
  ],
  unassigned: [patient("p6", "Einzeln", 49.421, 8.7473)],
};

/** Berechnet die Aufteilung und wartet, bis die Gebiete stehen. */
async function compute(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  await user.click(screen.getByRole("button", { name: t("clustering.actions.run") }));
  await waitFor(() => expect(screen.getByTestId("cluster-0")).toBeInTheDocument());
}

describe("Gebietsaufteilung", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    computeDailyClustering.mockReset().mockResolvedValue(RESULT);
    optimizeRoute.mockReset().mockResolvedValue({ status: "queued" });
  });

  it("zeigt je Gebiet Patientenzahl, Ausdehnung und vorgeschlagene Fachkraft", async () => {
    const user = userEvent.setup();
    render(<ClusteringPage />);
    await compute(user);

    const first = screen.getByTestId("cluster-0");
    expect(first).toHaveTextContent("3");
    expect(first).toHaveTextContent("1,42 km");
    expect(first).toHaveTextContent("Anna Nordpflege");

    const second = screen.getByTestId("cluster-1");
    expect(second).toHaveTextContent("Markus Suedpflege");

    expect(screen.getByText(t("clustering.summary").replace("{patients}", "5").replace("{clusters}", "2"))).toBeInTheDocument();
  });

  it("nennt die Patienten, die keinem Gebiet zugeordnet sind", async () => {
    // DBSCAN darf einen Patienten liegen lassen. Ihn nicht anzuzeigen wäre die
    // gefährlichste Variante: er verschwände lautlos aus der Planung.
    const user = userEvent.setup();
    render(<ClusteringPage />);
    await compute(user);

    const block = screen.getByTestId("unassigned");
    expect(block).toHaveTextContent("Test Einzeln");
  });

  it("sperrt den VRPTW-Knopf, solange kein Gebiet angenommen wurde", async () => {
    const user = userEvent.setup();
    render(<ClusteringPage />);
    await compute(user);

    const launch = screen.getByRole("button", { name: t("clustering.actions.launchVrptw") });
    expect(launch).toBeDisabled();
    expect(screen.getByText(t("clustering.vrptw.needsAcceptance"))).toBeInTheDocument();

    const accept = screen.getAllByRole("button", { name: t("clustering.actions.accept") })[0]!;
    await user.click(accept);

    expect(launch).toBeEnabled();
  });

  it("optimiert genau die Touren der angenommenen Gebiete", async () => {
    const user = userEvent.setup();
    render(<ClusteringPage />);
    await compute(user);

    // Nur das ZWEITE Gebiet annehmen: der Lauf darf nicht das erste mitnehmen.
    await user.click(screen.getAllByRole("button", { name: t("clustering.actions.accept") })[1]!);
    await user.click(screen.getByRole("button", { name: t("clustering.actions.launchVrptw") }));

    await waitFor(() => expect(optimizeRoute).toHaveBeenCalledTimes(1));
    expect(optimizeRoute).toHaveBeenCalledWith("route-sued");
  });

  it("ein abgelehntes Gebiet zählt nicht als angenommen", async () => {
    const user = userEvent.setup();
    render(<ClusteringPage />);
    await compute(user);

    await user.click(screen.getAllByRole("button", { name: t("clustering.actions.reject") })[0]!);

    expect(screen.getByRole("button", { name: t("clustering.actions.launchVrptw") })).toBeDisabled();
  });

  it("erklärt dem Basic-Tenant, warum nichts berechnet wird", async () => {
    computeDailyClustering.mockRejectedValue(
      new MockApiError(403, "PlanFeatureUnavailable", "nicht enthalten"),
    );
    const user = userEvent.setup();
    render(<ClusteringPage />);

    await user.click(screen.getByRole("button", { name: t("clustering.actions.run") }));

    await waitFor(() =>
      expect(screen.getByText(t("clustering.errors.planTitle"))).toBeInTheDocument(),
    );
    expect(screen.getByText(t("clustering.errors.planBody"))).toBeInTheDocument();
    // Kein halbes Ergebnis daneben.
    expect(screen.queryByTestId("cluster-0")).not.toBeInTheDocument();
  });

  it("benennt eine blockierende Geokodierung statt sie zu verschlucken", async () => {
    computeDailyClustering.mockRejectedValue(
      new MockApiError(409, "GeocodingIncomplete", "1 Patient ohne gültige Geokodierung"),
    );
    const user = userEvent.setup();
    render(<ClusteringPage />);

    await user.click(screen.getByRole("button", { name: t("clustering.actions.run") }));

    await waitFor(() =>
      expect(screen.getByText(t("clustering.errors.geocodingTitle"))).toBeInTheDocument(),
    );
    expect(screen.getByText("1 Patient ohne gültige Geokodierung")).toBeInTheDocument();
  });

  it("verlangt k nur bei k-Means", async () => {
    const user = userEvent.setup();
    render(<ClusteringPage />);

    expect(screen.queryByLabelText(t("clustering.fields.k"))).not.toBeInTheDocument();

    await user.selectOptions(
      screen.getByLabelText(t("clustering.fields.algorithm")),
      "kmeans",
    );
    expect(screen.getByLabelText(t("clustering.fields.k"))).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: t("clustering.actions.run") }));
    await waitFor(() => expect(computeDailyClustering).toHaveBeenCalled());
    expect(computeDailyClustering).toHaveBeenCalledWith(
      expect.objectContaining({ algorithm: "kmeans", k: 4 }),
    );
  });

  it("zeigt den Wartezustand, wenn der Tag in die Warteschlange geht", async () => {
    // Grosse Struktur: 202 statt Ergebnis. Ohne sichtbaren Status müsste der
    // Koordinator raten, ob noch gerechnet wird oder etwas hängt.
    //
    // Der Socket wird ersetzt, weil der von jsdom sofort scheitert und die
    // Seite daraufhin – zu Recht – auf "Status unbekannt" schaltet. Geprüft
    // werden soll hier die Warteschlange, nicht der Verbindungsabbruch.
    vi.stubGlobal(
      "WebSocket",
      class {
        onmessage: unknown = null;
        onerror: unknown = null;
        close(): void {}
      },
    );
    computeDailyClustering.mockResolvedValue({
      jobId: "org:2026-09-07",
      status: "queued",
      date: "2026-09-07",
      patientCount: 240,
    });
    const user = userEvent.setup();
    render(<ClusteringPage />);

    await user.click(screen.getByRole("button", { name: t("clustering.actions.run") }));

    await waitFor(() =>
      expect(screen.getByText(t("clustering.jobStatus.pending"))).toBeInTheDocument(),
    );
  });
});
