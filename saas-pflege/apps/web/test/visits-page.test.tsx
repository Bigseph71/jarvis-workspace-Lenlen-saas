import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
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
  rescheduleVisit,
  openIncidents,
  acknowledgeIncident,
} = vi.hoisted(() => ({
  listVisits: vi.fn(),
  missingWeek: vi.fn(),
  cancelVisit: vi.fn(),
  listCaregivers: vi.fn(),
  assignVisitCaregiver: vi.fn(),
  rescheduleVisit: vi.fn(),
  openIncidents: vi.fn(),
  acknowledgeIncident: vi.fn(),
}));

vi.mock("@len-len/api-client", () => ({
  listVisits: (...args: unknown[]) => listVisits(...args),
  missingWeek: (...args: unknown[]) => missingWeek(...args),
  cancelVisit: (...args: unknown[]) => cancelVisit(...args),
  listCaregivers: (...args: unknown[]) => listCaregivers(...args),
  assignVisitCaregiver: (...args: unknown[]) => assignVisitCaregiver(...args),
  rescheduleVisit: (...args: unknown[]) => rescheduleVisit(...args),
  // Die Seite reicht die Backend-Meldung eines 409 durch; ohne die echte
  // Klasse waere `err instanceof ApiError` immer falsch und der Test pruefte
  // still den Sammelfehler.
  ApiError: class ApiError extends Error {
    constructor(
      public readonly status: number,
      public readonly code: string,
      message: string,
    ) {
      super(message);
      this.name = "ApiError";
    }
  },
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
    // Seit die Liste ihre GPS-Felder auch im Typ fuehrt, gehoeren sie in die
    // Attrappe: ein Besuch ohne Pointage ist der Normalfall vor der Ankunft.
    gpsArrivalAt: null,
    gpsDepartureAt: null,
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

/**
 * Eine geplante Visite bearbeiten.
 *
 * Der Bildschirm konnte bis hierher nur ABSAGEN. Wer einen Termin um eine
 * halbe Stunde verschieben wollte, musste den Besuch stornieren und neu
 * anlegen -- und verlor dabei seine Vorgeschichte im Audit-Log.
 */
describe("Besuch bearbeiten", () => {
  async function renderMitBesuch(over: Partial<Visit> = {}) {
    // Die Zaehler der Attrappen zuruecksetzen: die Tests dieses Blocks pruefen,
    // dass ein Endpunkt NICHT gerufen wurde, und ein Aufruf aus dem Test davor
    // faende sich sonst hier wieder.
    vi.clearAllMocks();
    listVisits.mockResolvedValue({ data: [visit(over)], total: 1, page: 1, pageSize: 50, totalPages: 1 });
    missingWeek.mockResolvedValue({ week: { start: "", end: "" }, count: 0, patients: [] });
    listCaregivers.mockResolvedValue({ data: [ANNA, BERND] });
    openIncidents.mockResolvedValue({ data: [], total: 0, page: 1, pageSize: 20, totalPages: 0 });
    render(<VisitsPage />);
    await screen.findByText(/Muster/);
  }

  it("bietet das Bearbeiten nur bei PLANNED an", async () => {
    // Ein begonnener Besuch hat einen Ankunftszeitpunkt, ein abgeschlossener
    // eine Dokumentation. Beide nachtraeglich zu verschieben loeste die Akte
    // von der Wirklichkeit.
    await renderMitBesuch({ status: "IN_PROGRESS" });

    expect(screen.queryByRole("button", { name: t("visits.actions.edit") })).not.toBeInTheDocument();
  });

  it("verschiebt den Termin ueber den Reschedule-Endpunkt", async () => {
    await renderMitBesuch();

    fireEvent.click(screen.getByRole("button", { name: t("visits.actions.edit") }));
    fireEvent.change(screen.getByLabelText(t("visits.editDateLabel")), {
      target: { value: "2026-09-07T10:30" },
    });
    fireEvent.click(screen.getByRole("button", { name: t("visits.actions.save") }));

    await waitFor(() => expect(rescheduleVisit).toHaveBeenCalledTimes(1));
    expect(rescheduleVisit.mock.calls[0]![0]).toBe("v-1");
  });

  it("wechselt die Fachkraft einer bereits zugewiesenen Visite", async () => {
    // Vorher liess sich nur eine Visite OHNE Fachkraft zuweisen; eine
    // Umbesetzung war ueber die Oberflaeche gar nicht moeglich.
    await renderMitBesuch();

    fireEvent.click(screen.getByRole("button", { name: t("visits.actions.edit") }));
    fireEvent.change(screen.getByLabelText(t("visits.editCaregiverLabel")), {
      target: { value: BERND.id },
    });
    fireEvent.click(screen.getByRole("button", { name: t("visits.actions.save") }));

    await waitFor(() => expect(assignVisitCaregiver).toHaveBeenCalledWith("v-1", BERND.id));
  });

  it("ruft nichts auf, wenn sich nichts geaendert hat", async () => {
    // Ein Speichern ohne Aenderung darf keinen Audit-Eintrag erzeugen.
    await renderMitBesuch();

    fireEvent.click(screen.getByRole("button", { name: t("visits.actions.edit") }));
    fireEvent.click(screen.getByRole("button", { name: t("visits.actions.save") }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(rescheduleVisit).not.toHaveBeenCalled();
    expect(assignVisitCaregiver).not.toHaveBeenCalled();
  });

  it("zeigt die Meldung des Backends bei einer Doppelbuchung", async () => {
    // Der 409 nennt die belegte Uhrzeit. Ihn durch eine eigene Sammelmeldung
    // zu ersetzen zwaenge den Koordinator zum Raten.
    const { ApiError } = await import("@len-len/api-client");
    rescheduleVisit.mockRejectedValue(
      new ApiError(409, "Conflict", "Diese Fachkraft hat um 09:00 UTC bereits einen Besuch."),
    );
    await renderMitBesuch();

    fireEvent.click(screen.getByRole("button", { name: t("visits.actions.edit") }));
    fireEvent.change(screen.getByLabelText(t("visits.editDateLabel")), {
      target: { value: "2026-09-07T09:00" },
    });
    fireEvent.click(screen.getByRole("button", { name: t("visits.actions.save") }));

    expect(await screen.findByText(/bereits einen Besuch/)).toBeInTheDocument();
  });

  it("laesst die Bearbeitung verwerfen", async () => {
    await renderMitBesuch();

    fireEvent.click(screen.getByRole("button", { name: t("visits.actions.edit") }));
    fireEvent.click(screen.getByRole("button", { name: t("visits.actions.abort") }));

    await waitFor(() =>
      expect(screen.queryByLabelText(t("visits.editDateLabel"))).not.toBeInTheDocument(),
    );
    expect(rescheduleVisit).not.toHaveBeenCalled();
  });
});
