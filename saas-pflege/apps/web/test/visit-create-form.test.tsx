import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { render, t } from "./helpers/render";

/**
 * Anlegen eines Besuchs, regulär und als Notfall.
 *
 * Der Notfall hat im Backend seit jeher einen eigenen Endpunkt; im Formular
 * fehlte er, sodass ein Admin über die Oberfläche schlicht keinen anlegen
 * konnte. Geprüft wird deshalb genau die Weiche:
 *
 *   1. Ohne Haken geht der Besuch an /visits, unverändert wie bisher.
 *   2. Mit Haken geht er an /visits/emergency, mit Motiv.
 *   3. Ein Notfall ohne Motiv wird gar nicht erst abgeschickt (Regel métier 2:
 *      Motiv verpflichtend) – der Fehler gehört vor den Netzwerkaufruf.
 *   4. Die gewählte Fachkraft landet im richtigen Feld: beim Regelbesuch
 *      ersetzt sie die Stamm-Fachkraft (assignedCaregiverId), beim Notfall
 *      benennt sie nur, wer fährt (caregiverId). Vertauscht würde die
 *      Stammzuordnung des Patienten durch einen Notfall überschrieben.
 */

const { listPatients, listCaregivers } = vi.hoisted(() => ({
  listPatients: vi.fn(),
  listCaregivers: vi.fn(),
}));

vi.mock("@len-len/api-client", () => ({
  listPatients: (...args: unknown[]) => listPatients(...args),
  listCaregivers: (...args: unknown[]) => listCaregivers(...args),
}));

import { VisitCreateForm } from "../src/components/visit-create-form";

const PATIENTS = {
  data: [{ id: "11111111-1111-1111-1111-111111111111", firstName: "Erika", lastName: "Muster" }],
};
const CAREGIVERS = {
  data: [{ id: "22222222-2222-2222-2222-222222222222", firstName: "Anna", lastName: "Pflege" }],
};

/** Füllt Patient und Termin aus – das Minimum für einen Regelbesuch. */
async function fillBase(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  await waitFor(() =>
    expect(screen.getByRole("option", { name: "Muster, Erika" })).toBeInTheDocument(),
  );
  await user.selectOptions(screen.getByLabelText(t("visits.form.patient")), PATIENTS.data[0]!.id);
  await user.type(screen.getByLabelText(t("visits.form.scheduledAt")), "2026-09-07T09:30");
}

function setup() {
  const onSubmit = vi.fn();
  render(<VisitCreateForm submitting={false} onSubmit={onSubmit} onCancel={vi.fn()} />);
  return { onSubmit, user: userEvent.setup() };
}

describe("Besuch anlegen", () => {
  beforeEach(() => {
    listPatients.mockReset().mockResolvedValue(PATIENTS);
    listCaregivers.mockReset().mockResolvedValue(CAREGIVERS);
  });

  it("legt ohne Haken einen regulären Besuch an", async () => {
    const { onSubmit, user } = setup();
    await fillBase(user);
    await user.click(screen.getByRole("button", { name: t("visits.form.create") }));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    const submission = onSubmit.mock.calls[0]![0];
    expect(submission.emergency).toBe(false);
    expect(submission.input.patientId).toBe(PATIENTS.data[0]!.id);
    expect(submission.input).not.toHaveProperty("emergencyReason");
  });

  it("blendet das Motivfeld erst mit dem Haken ein", async () => {
    const { user } = setup();
    expect(screen.queryByLabelText(t("visits.form.emergencyReason"))).not.toBeInTheDocument();

    await user.click(screen.getByLabelText(t("visits.form.emergency")));

    expect(screen.getByLabelText(t("visits.form.emergencyReason"))).toBeInTheDocument();
  });

  it("legt mit Haken und Motiv einen Notfallbesuch an", async () => {
    const { onSubmit, user } = setup();
    await fillBase(user);
    await user.click(screen.getByLabelText(t("visits.form.emergency")));
    await user.type(screen.getByLabelText(t("visits.form.emergencyReason")), "Sturz in der Wohnung");
    await user.click(screen.getByRole("button", { name: t("visits.form.create") }));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit.mock.calls[0]![0]).toEqual({
      emergency: true,
      input: {
        patientId: PATIENTS.data[0]!.id,
        scheduledAt: expect.any(String),
        emergencyReason: "Sturz in der Wohnung",
      },
    });
  });

  it("schickt einen Notfall ohne Motiv nicht ab", async () => {
    const { onSubmit, user } = setup();
    await fillBase(user);
    await user.click(screen.getByLabelText(t("visits.form.emergency")));
    await user.click(screen.getByRole("button", { name: t("visits.form.create") }));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText(t("visits.form.errors.emergencyReason"))).toBeInTheDocument();
  });

  it("wertet ein Motiv aus lauter Leerzeichen nicht als Angabe", async () => {
    const { onSubmit, user } = setup();
    await fillBase(user);
    await user.click(screen.getByLabelText(t("visits.form.emergency")));
    await user.type(screen.getByLabelText(t("visits.form.emergencyReason")), "   ");
    await user.click(screen.getByRole("button", { name: t("visits.form.create") }));

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("ordnet die Fachkraft je nach Art dem richtigen Feld zu", async () => {
    const caregiverId = CAREGIVERS.data[0]!.id;
    const { onSubmit, user } = setup();
    await fillBase(user);
    await user.selectOptions(screen.getByLabelText(t("visits.form.caregiver")), caregiverId);

    // Regelbesuch: ersetzt die Stamm-Fachkraft.
    await user.click(screen.getByRole("button", { name: t("visits.form.create") }));
    expect(onSubmit.mock.calls[0]![0].input).toMatchObject({ assignedCaregiverId: caregiverId });

    // Notfall: benennt nur die effektive Fachkraft.
    await user.click(screen.getByLabelText(t("visits.form.emergency")));
    await user.type(screen.getByLabelText(t("visits.form.emergencyReason")), "Akute Verschlechterung");
    await user.click(screen.getByRole("button", { name: t("visits.form.create") }));

    const emergencySubmission = onSubmit.mock.calls[1]![0];
    expect(emergencySubmission.input).toMatchObject({ caregiverId });
    expect(emergencySubmission.input).not.toHaveProperty("assignedCaregiverId");
  });

  it("verwirft das Motiv, wenn der Haken wieder entfernt wird", async () => {
    // Sonst hinge ein alter Grund am nächsten Notfall, ohne dass ihn jemand
    // gelesen hätte.
    const { user } = setup();
    await user.click(screen.getByLabelText(t("visits.form.emergency")));
    await user.type(screen.getByLabelText(t("visits.form.emergencyReason")), "Sturz");
    await user.click(screen.getByLabelText(t("visits.form.emergency")));
    await user.click(screen.getByLabelText(t("visits.form.emergency")));

    expect(screen.getByLabelText(t("visits.form.emergencyReason"))).toHaveValue("");
  });
});
