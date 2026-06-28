"use client";

import { useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import type { Qualification } from "@/lib/api/caregivers";

const QUALIFICATIONS: Qualification[] = [
  "PFLEGEFACHKRAFT",
  "PFLEGEHILFSKRAFT",
  "BETREUUNGSKRAFT",
  "AUSZUBILDENDE",
];

export interface CaregiverIdentity {
  firstName: string;
  lastName: string;
  qualification: Qualification;
}

interface CaregiverEditFormProps {
  initial: CaregiverIdentity;
  submitting: boolean;
  error?: string | null;
  onSubmit: (values: CaregiverIdentity) => void;
  onCancel: () => void;
}

const fieldClass =
  "mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:outline-none";

/** Bearbeitung des Identitäts-Blocks (ohne Vertrag) einer Fachkraft. */
export function CaregiverEditForm({ initial, submitting, error, onSubmit, onCancel }: CaregiverEditFormProps) {
  const t = useTranslations("caregivers");

  const [firstName, setFirstName] = useState(initial.firstName);
  const [lastName, setLastName] = useState(initial.lastName);
  const [qualification, setQualification] = useState<Qualification>(initial.qualification);
  const [errors, setErrors] = useState<Partial<Record<"firstName" | "lastName", string>>>({});

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fn = firstName.trim();
    const ln = lastName.trim();
    const next: typeof errors = {};
    if (fn.length < 1 || fn.length > 80) next.firstName = t("errors.firstName");
    if (ln.length < 1 || ln.length > 80) next.lastName = t("errors.lastName");
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    onSubmit({ firstName: fn, lastName: ln, qualification });
  }

  return (
    <form className="max-w-lg space-y-4" onSubmit={handleSubmit} noValidate>
      <div>
        <label htmlFor="firstName" className="block text-sm font-medium text-gray-700">
          {t("fields.firstName")}
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
          {t("fields.lastName")}
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
        <label htmlFor="qualification" className="block text-sm font-medium text-gray-700">
          {t("fields.qualification")}
        </label>
        <select
          id="qualification"
          value={qualification}
          onChange={(e) => setQualification(e.target.value as Qualification)}
          className={fieldClass}
        >
          {QUALIFICATIONS.map((q) => (
            <option key={q} value={q}>
              {t(`qualifications.${q}`)}
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
          {submitting ? t("form.saving") : t("form.save")}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 transition hover:bg-gray-100"
        >
          {t("form.cancel")}
        </button>
      </div>
    </form>
  );
}
