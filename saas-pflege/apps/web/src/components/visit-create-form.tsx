"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { listPatients, type Patient } from "@len-len/api-client";
import { listCaregivers, type Caregiver } from "@len-len/api-client";
import type { CreateVisitInput } from "@len-len/api-client";

interface VisitCreateFormProps {
  submitting: boolean;
  error?: string | null;
  onSubmit: (input: CreateVisitInput) => void;
  onCancel: () => void;
}

const fieldClass =
  "mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:outline-none";

export function VisitCreateForm({ submitting, error, onSubmit, onCancel }: VisitCreateFormProps) {
  const t = useTranslations("visits.form");

  const [patients, setPatients] = useState<Patient[]>([]);
  const [caregivers, setCaregivers] = useState<Caregiver[]>([]);

  const [patientId, setPatientId] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [caregiverId, setCaregiverId] = useState("");
  const [errors, setErrors] = useState<{ patientId?: string; scheduledAt?: string }>({});

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
    const next: typeof errors = {};
    if (!patientId) next.patientId = t("errors.patient");
    if (!scheduledAt) next.scheduledAt = t("errors.scheduledAt");
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    onSubmit({
      patientId,
      scheduledAt: new Date(scheduledAt).toISOString(),
      ...(caregiverId ? { assignedCaregiverId: caregiverId } : {}),
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
          <option value="">{t("defaultCaregiver")}</option>
          {caregivers.map((c) => (
            <option key={c.id} value={c.id}>
              {c.lastName}, {c.firstName}
            </option>
          ))}
        </select>
        <p className="mt-1 text-xs text-gray-400">{t("caregiverHint")}</p>
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
