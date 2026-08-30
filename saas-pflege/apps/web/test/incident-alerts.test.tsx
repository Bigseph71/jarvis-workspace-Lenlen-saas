import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { OpenIncident } from "@len-len/api-client";
import { render } from "./helpers/render";

/**
 * Vorfall-Alarme über der Besuchsliste.
 *
 * Der Knopf ist der Grund, warum es diese Komponente gibt. Eine Warnung, die
 * sich nicht schliessen lässt, steht dauerhaft auf dem Bildschirm und wird
 * überlesen – deshalb prüfen die Tests vor allem, dass die Kenntnisnahme die
 * Meldung tatsächlich aus der Liste nimmt, und dass ein Fehlschlag dabei nicht
 * so aussieht, als wäre sie erledigt.
 */

const { openIncidents, acknowledgeIncident } = vi.hoisted(() => ({
  openIncidents: vi.fn(),
  acknowledgeIncident: vi.fn(),
}));

vi.mock("@len-len/api-client", () => ({
  openIncidents: (...args: unknown[]) => openIncidents(...args),
  acknowledgeIncident: (...args: unknown[]) => acknowledgeIncident(...args),
}));

vi.mock("@/i18n/navigation", async () => {
  const { default: NextLink } = await import("next/link");
  return { Link: NextLink };
});

import { IncidentAlerts } from "../src/components/incident-alerts";

function incident(overrides: Partial<OpenIncident> = {}): OpenIncident {
  return {
    id: "v-1",
    scheduledAt: "2026-09-02T09:00:00.000Z",
    status: "COMPLETED",
    isEmergency: false,
    visitNote: "Blutdruck stark erhöht, Hausarzt verständigt.",
    visitNoteWrittenAt: "2026-09-02T09:45:00.000Z",
    patient: { id: "p-1", firstName: "Erika", lastName: "Muster" },
    caregiver: { id: "c-1", firstName: "Rita", lastName: "Vorfall" },
    ...overrides,
  };
}

function mockList(...data: OpenIncident[]) {
  openIncidents.mockResolvedValue({
    data,
    total: data.length,
    page: 1,
    pageSize: 20,
    totalPages: 1,
  });
}

describe("Vorfall-Alarme", () => {
  beforeEach(() => {
    openIncidents.mockReset();
    acknowledgeIncident.mockReset().mockResolvedValue(undefined);
  });

  it("zeigt nichts an, solange kein Vorfall offen ist", async () => {
    mockList();
    render(<IncidentAlerts />);

    // Kein leerer Kasten, keine Überschrift: eine ruhige Seite ist die
    // Aussage "es liegt nichts an".
    await waitFor(() => expect(openIncidents).toHaveBeenCalled());
    expect(screen.queryByTestId("incident-alerts")).not.toBeInTheDocument();
  });

  it("zeigt den Notiztext, den Patienten und die meldende Fachkraft", async () => {
    mockList(incident());
    render(<IncidentAlerts />);

    // Der Text ist der eigentliche Inhalt der Warnung.
    expect(
      await screen.findByText("Blutdruck stark erhöht, Hausarzt verständigt."),
    ).toBeInTheDocument();
    expect(screen.getByText("Muster, Erika")).toBeInTheDocument();
    expect(screen.getByText(/Vorfall, Rita/)).toBeInTheDocument();
  });

  it("nimmt die Meldung nach der Kenntnisnahme aus der Liste", async () => {
    mockList(incident({ id: "v-1" }), incident({ id: "v-2", visitNote: "Wohnung verwahrlost." }));
    render(<IncidentAlerts />);

    const buttons = await screen.findAllByRole("button", { name: "Zur Kenntnis genommen" });
    await userEvent.click(buttons[0]!);

    await waitFor(() => expect(acknowledgeIncident).toHaveBeenCalledWith("v-1"));
    await waitFor(() =>
      expect(
        screen.queryByText("Blutdruck stark erhöht, Hausarzt verständigt."),
      ).not.toBeInTheDocument(),
    );
    // Die zweite Meldung bleibt: quittiert wurde genau eine.
    expect(screen.getByText("Wohnung verwahrlost.")).toBeInTheDocument();
  });

  it("lässt die Meldung stehen, wenn die Kenntnisnahme fehlschlägt", async () => {
    // Sonst verschwände die Warnung, ohne dass irgendwo etwas gespeichert wäre –
    // der Vorfall wäre aus der Welt, ohne bearbeitet worden zu sein.
    acknowledgeIncident.mockRejectedValue(new Error("Netz"));
    mockList(incident());
    render(<IncidentAlerts />);

    await userEvent.click(await screen.findByRole("button", { name: "Zur Kenntnis genommen" }));

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.getByText("Blutdruck stark erhöht, Hausarzt verständigt.")).toBeInTheDocument();
  });

  it("bleibt still, wenn die Abfrage scheitert", async () => {
    // Die Besuchsseite muss ohne diese Nebenliste benutzbar bleiben, und ein
    // roter Balken für eine Nebenabfrage würde die echten Alarme entwerten.
    openIncidents.mockRejectedValue(new Error("Netz"));
    render(<IncidentAlerts />);

    await waitFor(() => expect(openIncidents).toHaveBeenCalled());
    expect(screen.queryByTestId("incident-alerts")).not.toBeInTheDocument();
  });
});
