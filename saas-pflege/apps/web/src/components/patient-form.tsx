"use client";

import { useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import type { Caregiver } from "@len-len/api-client";

/** Vom Formular emittierte Werte (leeres Feld der Fachkraft = null). */
export interface PatientFormValues {
  firstName: string;
  lastName: string;
  rawAddress: string;
  assignedCaregiverId: string | null;
}

interface PatientFormProps {
  initial?: PatientFormValues;
  caregivers: Caregiver[];
  submitting: boolean;
  error?: string | null;
  submitLabel: string;
  onSubmit: (values: PatientFormValues) => void;
  onCancel: () => void;
}

// Grenzen spiegeln die Zod-Schemata des Backends (createPatientSchema).
const LIMITS = {
  name: { min: 1, max: 80 },
  address: { min: 3, max: 300 },
};

export function PatientForm({
  initial,
  caregivers,
  submitting,
  error,
  submitLabel,
  onSubmit,
  onCancel,
}: PatientFormProps) {
  const t = useTranslations("patients.form");

  const [firstName, setFirstName] = useState(initial?.firstName ?? "");
  const [lastName, setLastName] = useState(initial?.lastName ?? "");
  const [rawAddress, setRawAddress] = useState(initial?.rawAddress ?? "");
  const [caregiverId, setCaregiverId] = useState(initial?.assignedCaregiverId ?? "");
  const [errors, setErrors] = useState<Partial<Record<"firstName" | "lastName" | "rawAddress", string>>>({});

  function validate(): boolean {
    const next: typeof errors = {};
    const fn = firstName.trim();
    const ln = lastName.trim();
    const addr = rawAddress.trim();
    if (fn.length < LIMITS.name.min || fn.length > LIMITS.name.max) next.firstName = t("errors.firstName");
    if (ln.length < LIMITS.name.min || ln.length > LIMITS.name.max) next.lastName = t("errors.lastName");
    if (addr.length < LIMITS.address.min || addr.length > LIMITS.address.max) {
      next.rawAddress = t("errors.rawAddress");
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!validate()) return;
    onSubmit({
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      rawAddress: rawAddress.trim(),
      assignedCaregiverId: caregiverId ? caregiverId : null,
    });
  }

  const fieldClass =
    "mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:outline-none";

  return (
    <form className="max-w-lg space-y-4" onSubmit={handleSubmit} noValidate>
      <div>
        <label htmlFor="firstName" className="block text-sm font-medium text-gray-700">
          {t("firstName")}
        </label>
        <input
          id="firstName"
          value={firstName}
          onChange={(e) => setFirstName(e.target.value)}
          className={fieldClass}
        />
        {errors.firstName ? <p className="mt-1 text-sm text-red-600">{errors.firstName}</p> : null}
      </div>

      <div>
        <label htmlFor="lastName" className="block text-sm font-medium text-gray-700">
          {t("lastName")}
        </label>
        <input
          id="lastName"
          value={lastName}
          onChange={(e) => setLastName(e.target.value)}
          className={fieldClass}
        />
        {errors.lastName ? <p className="mt-1 text-sm text-red-600">{errors.lastName}</p> : null}
      </div>

      <div>
        <label htmlFor="rawAddress" className="block text-sm font-medium text-gray-700">
          {t("address")}
        </label>
        <input
          id="rawAddress"
          value={rawAddress}
          onChange={(e) => setRawAddress(e.target.value)}
          className={fieldClass}
        />
        {errors.rawAddress ? <p className="mt-1 text-sm text-red-600">{errors.rawAddress}</p> : null}
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
          <option value="">{t("noCaregiver")}</option>
          {caregivers.map((c) => (
            <option key={c.id} value={c.id}>
              {c.lastName}, {c.firstName}
            </option>
          ))}
        </select>
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
          {submitting ? t("saving") : submitLabel}
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
