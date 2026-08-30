import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Visit } from "@len-len/api-client";
import { render, t } from "./helpers/render";

/**
 * Wochenliste der Besuche.
 *
 * Zwei Lücken, die der Notfall aufgedeckt hat:
 *
 *   1. Ein Notfall ohne effektive Fachkraft steht in keiner Tagesroute – die
 *      Mobile-App filtert auf caregiverId. Die Liste zeigte dafür die
 *      Stamm-Fachkraft des Patienten an und sah damit erledigt aus, obwohl
 *      niemand fährt. Jetzt wird der Besuch oben gemeldet und lässt sich in
 *      der Zeile selbst zuweisen.
 *   2. Das Motiv wurde gespeichert und auditiert, aber nirgends gezeigt. Der
 *      Koordinator sah ein rotes Abzeichen ohne Begründung.
 */

const {
  listVisits,
  missingWeek,
  cancelVisit,
  listCaregivers,
  assignVisitCaregiver,
  openIncidents,
  acknowledgeIncident,
} = vi.hoisted(() => ({
  listVisits: vi.fn(),
  missingWeek: vi.fn(),
  cancelVisit: vi.fn(),
  listCaregivers: vi.fn(),
  assignVisitCaregiver: vi.fn(),
  openIncidents: vi.fn(),
  acknowledgeIncident: vi.fn(),
}));

vi.mock("@len-len/api-client", () => ({
  listVisits: (...args: unknown[]) => listVisits(...args),
  missingWeek: (...args: unknown[]) => missingWeek(...args),
  cancelVisit: (...args: unknown[]) => cancelVisit(...args),
  listCaregivers: (...args: unknown[]) => listCaregivers(...args),
  assignVisitCaregiver: (...args: unknown[]) => assignVisitCaregiver(...args),
  // Die Seite bindet seit den Vorfall-Alarmen zwei weitere Aufrufe ein. Ohne
  // Attrappe liefe der Test gegen `undefined` und prüfte still den Fehlerpfad.
  openIncidents: (...args: unknown[]) => openIncidents(...args),
  acknowledgeIncident: (...args: unknown[]) => acknowledgeIncident(...args),
}));

vi.mock("@/i18n/navigation", async () => {
  const { default: NextLink } = await import("next/link");
  return { Link: NextLink };
});

import VisitsPage from "../src/app/[locale]/(protected)/visits/page";

const ANNA = { id: "c-anna", firstName: "Anna", lastName: "Pflege", userId: "u-anna" };
const BERND = { id: "c-bernd", firstName: "Bernd", lastName: "Ersatz" };

function visit(overrides: Partial<Visit> = {}): Visit {
  return {
    id: "v-1",
    patientId: "p-1",
    scheduledAt: "2026-09-07T08:00:00.000Z",
    status: "PLANNED",
    isEmergency: false,
    emergencyReason: null,
    patient: { id: "p-1", firstName: "Erika", lastName: "Muster" },
    caregiver: ANNA,
    assignedCaregiver: { id: ANNA.id, firstName: ANNA.firstName, lastName: ANNA.lastName },
    ...overrides,
  };
}

/** Notfall, den niemand fährt: Stammkraft am Patienten, effektive fehlt. */
const OPEN_EMERGENCY = visit({
  id: "v-notfall",
  isEmergency: true,
  emergencyReason: "Sturz in der Wohnung",
  caregiver: null,
});

function mockVisits(...data: Visit[]) {
  listVisits.mockResolvedValue({ data, total: data.length, page: 1, pageSize: 100, totalPages: 1 });
}

/** Wartet, bis die Wochenliste geladen ist. */
async function ready(): Promise<void> {
  await waitFor(() => expect(screen.queryByText(t("visits.loading"))).not.toBeInTheDocument());
}

describe("Besuchsliste", () => {
  beforeEach(() => {
    listVisits.mockReset();
    missingWeek.mockReset().mockResolvedValue({
      week: { start: "2026-09-07", end: "2026-09-14" },
      count: 0,
      patients: [],
    });
    cancelVisit.mockReset().mockResolvedValue(undefined);
    listCaregivers.mockReset().mockResolvedValue({ data: [ANNA, BERND] });
    assignVisitCaregiver.mockReset().mockResolvedValue(undefined);
    openIncidents.mockReset().mockResolvedValue({
      data: [],
      total: 0,
      page: 1,
      pageSize: 20,
      totalPages: 0,
    });
    acknowledgeIncident.mockReset().mockResolvedValue(undefined);
  });

  it("zeigt das Motiv eines Notfalls neben dem Patienten", async () => {
    mockVisits(OPEN_EMERGENCY);
    render(<VisitsPage />);
    await ready();

    expect(screen.getByText(/Sturz in der Wohnung/)).toBeInTheDocument();
  });

  it("meldet Besuche, die in keiner Tagesroute stehen", async () => {
    mockVisits(OPEN_EMERGENCY);
    render(<VisitsPage />);
    await ready();

    const alert = await screen.findByTestId("unassigned-alert");
    expect(alert).toHaveTextContent(t("visits.unassignedTitle").replace("{count}", "1"));
  });

  it("schweigt, wenn jeder Besuch eine Fachkraft hat", async () => {
    mockVisits(visit(), visit({ id: "v-2", isEmergency: true, emergencyReason: "Fieber" }));
    render(<VisitsPage />);
    await ready();

    expect(screen.queryByTestId("unassigned-alert")).not.toBeInTheDocument();
  });

  it("nennt einen offenen Notfall nicht die Stamm-Fachkraft des Patienten", async () => {
    // Der eigentliche Fehler: die Liste zeigte "Pflege, Anna" für einen Besuch,
    // den Anna nie zu sehen bekommt.
    mockVisits(OPEN_EMERGENCY);
    render(<VisitsPage />);
    await ready();

    const row = screen.getByText("Muster, Erika").closest("tr")!;
    // Anna darf als Auswahlmöglichkeit auftauchen – nur nicht als der Name,
    // der die Zeile als versorgt ausweist. Daher die <option> ausgenommen.
    expect(within(row).queryByText("Pflege, Anna", { ignore: "option" })).not.toBeInTheDocument();

    const select = within(row).getByLabelText(t("visits.assignLabel"));
    expect(select).toHaveValue("");
  });

  it("weist eine Fachkraft direkt aus der Zeile zu und lädt neu", async () => {
    mockVisits(OPEN_EMERGENCY);
    const user = userEvent.setup();
    render(<VisitsPage />);
    await ready();
    await waitFor(() =>
      expect(screen.getByRole("option", { name: "Ersatz, Bernd" })).toBeInTheDocument(),
    );

    const callsBefore = listVisits.mock.calls.length;
    await user.selectOptions(screen.getByLabelText(t("visits.assignLabel")), BERND.id);

    await waitFor(() => expect(assignVisitCaregiver).toHaveBeenCalledWith("v-notfall", BERND.id));
    await waitFor(() => expect(listVisits.mock.calls.length).toBeGreaterThan(callsBefore));
  });

  it("bietet die Zuweisung nicht mehr an, sobald der Besuch abgeschlossen ist", async () => {
    // Das Backend lehnt eine Neuzuweisung auf COMPLETED/CANCELED ab; ein
    // Auswahlfeld dafür führte nur in einen 409.
    mockVisits(visit({ id: "v-alt", isEmergency: true, caregiver: null, status: "COMPLETED" }));
    render(<VisitsPage />);
    await ready();

    expect(screen.queryByLabelText(t("visits.assignLabel"))).not.toBeInTheDocument();
    expect(screen.queryByTestId("unassigned-alert")).not.toBeInTheDocument();
  });

  it("meldet eine gescheiterte Zuweisung, statt sie zu verschlucken", async () => {
    assignVisitCaregiver.mockRejectedValue(new Error("422"));
    mockVisits(OPEN_EMERGENCY);
    const user = userEvent.setup();
    render(<VisitsPage />);
    await ready();
    await waitFor(() =>
      expect(screen.getByRole("option", { name: "Ersatz, Bernd" })).toBeInTheDocument(),
    );

    await user.selectOptions(screen.getByLabelText(t("visits.assignLabel")), BERND.id);

    expect(await screen.findByText(t("visits.assignError"))).toBeInTheDocument();
  });
});
