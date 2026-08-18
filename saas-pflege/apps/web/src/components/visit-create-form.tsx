"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { listPatients, type Patient } from "@len-len/api-client";
import { listCaregivers, type Caregiver } from "@len-len/api-client";
import type { CreateVisitInput, CreateEmergencyVisitInput } from "@len-len/api-client";

/**
 * Ein Formular, zwei Endpunkte. Der reguläre Besuch und der Notfallbesuch
 * unterscheiden sich in den Regeln (Wochenzyklus, Arbeitstag, Qualifikation)
 * und damit im Backend-Endpunkt, nicht in den Feldern, die der Koordinator
 * ausfüllt. Deshalb ein unterscheidbares Ergebnis statt zweier Formulare.
 */
export type VisitFormSubmit =
  | { emergency: false; input: CreateVisitInput }
  | { emergency: true; input: CreateEmergencyVisitInput };

interface VisitCreateFormProps {
  submitting: boolean;
  error?: string | null;
  onSubmit: (submission: VisitFormSubmit) => void;
  onCancel: () => void;
}

const fieldClass =
  "mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:outline-none";

// Spiegelt createEmergencyVisitSchema im Backend (min 3, max 500).
const REASON_MIN = 3;
const REASON_MAX = 500;

export function VisitCreateForm({ submitting, error, onSubmit, onCancel }: VisitCreateFormProps) {
  const t = useTranslations("visits.form");

  const [patients, setPatients] = useState<Patient[]>([]);
  const [caregivers, setCaregivers] = useState<Caregiver[]>([]);

  const [patientId, setPatientId] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [caregiverId, setCaregiverId] = useState("");
  const [emergency, setEmergency] = useState(false);
  const [emergencyReason, setEmergencyReason] = useState("");
  const [errors, setErrors] = useState<{
    patientId?: string;
    scheduledAt?: string;
    emergencyReason?: string;
  }>({});

  useEffect(() => {
    let active = true;
    Promise.all([listPatients({ pageSize: 100 }), listCaregivers({ pageSize: 100 })])
      .then(([p, c]) => {
        if (!active) return;
        setPatients(p.data);
        setCaregivers(c.data);
      })
      .catch(() => {
        /* Selektoren best effort. */
      });
    return () => {
      active = false;
    };
  }, []);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const reason = emergencyReason.trim();
    const next: typeof errors = {};
    if (!patientId) next.patientId = t("errors.patient");
    if (!scheduledAt) next.scheduledAt = t("errors.scheduledAt");
    if (emergency && reason.length < REASON_MIN) next.emergencyReason = t("errors.emergencyReason");
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    const when = new Date(scheduledAt).toISOString();

    if (emergency) {
      // Notfall: die gewählte Fachkraft ist die effektive (caregiverId). Die
      // Stamm-Fachkraft des Patienten bleibt unangetastet, der Besuch läuft
      // ausserhalb des Zyklus.
      onSubmit({
        emergency: true,
        input: {
          patientId,
          scheduledAt: when,
          emergencyReason: reason,
          ...(caregiverId ? { caregiverId } : {}),
        },
      });
      return;
    }

    onSubmit({
      emergency: false,
      input: {
        patientId,
        scheduledAt: when,
        ...(caregiverId ? { assignedCaregiverId: caregiverId } : {}),
      },
    });
  }

  return (
    <form className="max-w-lg space-y-4" onSubmit={handleSubmit} noValidate>
      <div>
        <label htmlFor="patient" className="block text-sm font-medium text-gray-700">
          {t("patient")}
        </label>
        <select
          id="patient"
          value={patientId}
          onChange={(e) => setPatientId(e.target.value)}
          className={fieldClass}
        >
          <option value="">{t("choosePatient")}</option>
          {patients.map((p) => (
            <option key={p.id} value={p.id}>
              {p.lastName}, {p.firstName}
            </option>
          ))}
        </select>
        {errors.patientId ? <p className="mt-1 text-sm text-red-600">{errors.patientId}</p> : null}
      </div>

      <div>
        <label htmlFor="scheduledAt" className="block text-sm font-medium text-gray-700">
          {t("scheduledAt")}
        </label>
        <input
          id="scheduledAt"
          type="datetime-local"
          value={scheduledAt}
          onChange={(e) => setScheduledAt(e.target.value)}
          className={fieldClass}
        />
        {errors.scheduledAt ? <p className="mt-1 text-sm text-red-600">{errors.scheduledAt}</p> : null}
      </div>

      <div>
        <label htmlFor="caregiver" className="block text-sm font-medium text-gray-700">
          {t("caregiver")}
        </label>
        <select
          id="caregiver"
          value={caregiverId}
          onChange={(e) => setCaregiverId(e.target.value)}
          className={fieldClass}
        >
          <option value="">{emergency ? t("noCaregiver") : t("defaultCaregiver")}</option>
          {caregivers.map((c) => (
            <option key={c.id} value={c.id}>
              {c.lastName}, {c.firstName}
            </option>
          ))}
        </select>
        <p className="mt-1 text-xs text-gray-400">
          {emergency ? t("emergencyCaregiverHint") : t("caregiverHint")}
        </p>
      </div>

      {/* Notfall (Regel métier 2) */}
      <div className="rounded-md border border-gray-200 bg-gray-50 p-3">
        <label htmlFor="emergency" className="flex items-center gap-2 text-sm font-medium text-gray-700">
          <input
            id="emergency"
            type="checkbox"
            checked={emergency}
            onChange={(e) => {
              setEmergency(e.target.checked);
              // Ein abgewählter Notfall darf keinen Grund zurücklassen, der
              // beim nächsten Anhaken ungeprüft wieder mitginge.
              if (!e.target.checked) {
                setEmergencyReason("");
                setErrors((prev) => ({ ...prev, emergencyReason: undefined }));
              }
            }}
            className="h-4 w-4 rounded border-gray-300 text-red-600 focus:ring-red-500"
          />
          {t("emergency")}
        </label>
        <p className="mt-1 text-xs text-gray-500">{t("emergencyHint")}</p>

        {emergency ? (
          <div className="mt-3">
            <label htmlFor="emergencyReason" className="block text-sm font-medium text-gray-700">
              {t("emergencyReason")}
            </label>
            <textarea
              id="emergencyReason"
              rows={3}
              maxLength={REASON_MAX}
              value={emergencyReason}
              onChange={(e) => setEmergencyReason(e.target.value)}
              className={fieldClass}
            />
            <p className="mt-1 text-xs text-gray-500">{t("emergencyReasonHint")}</p>
            {errors.emergencyReason ? (
              <p className="mt-1 text-sm text-red-600">{errors.emergencyReason}</p>
            ) : null}
          </div>
        ) : null}
      </div>

      {error ? (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      ) : null}

      <div className="flex gap-3 pt-2">
        <button
          type="submit"
          disabled={submitting}
          className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-gray-700 disabled:opacity-50"
        >
          {submitting ? t("saving") : t("create")}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 transition hover:bg-gray-100"
        >
          {t("cancel")}
        </button>
      </div>
    </form>
  );
}
