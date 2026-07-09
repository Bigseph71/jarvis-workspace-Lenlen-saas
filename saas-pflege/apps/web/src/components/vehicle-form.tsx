"use client";

import { useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";

/** Vom Formular emittierte Werte (leeres Datum = null). */
export interface VehicleFormValues {
  label: string;
  leasingKmLimit: number;
  leasingEndDate: string | null;
}

interface VehicleFormProps {
  initial?: VehicleFormValues;
  submitting: boolean;
  error?: string | null;
  submitLabel: string;
  onSubmit: (values: VehicleFormValues) => void;
  onCancel: () => void;
}

// Grenzen spiegeln die Zod-Schemata des Backends (createVehicleSchema).
const LIMITS = {
  label: { min: 1, max: 120 },
  km: { min: 1, max: 2_000_000 },
};

export function VehicleForm({
  initial,
  submitting,
  error,
  submitLabel,
  onSubmit,
  onCancel,
}: VehicleFormProps) {
  const t = useTranslations("leasing.form");

  const [label, setLabel] = useState(initial?.label ?? "");
  const [kmLimit, setKmLimit] = useState(initial?.leasingKmLimit != null ? String(initial.leasingKmLimit) : "");
  const [endDate, setEndDate] = useState(initial?.leasingEndDate ?? "");
  const [errors, setErrors] = useState<Partial<Record<"label" | "leasingKmLimit", string>>>({});

  function validate(): boolean {
    const next: typeof errors = {};
    const lbl = label.trim();
    const km = Number(kmLimit);
    if (lbl.length < LIMITS.label.min || lbl.length > LIMITS.label.max) next.label = t("errors.label");
    if (!Number.isInteger(km) || km < LIMITS.km.min || km > LIMITS.km.max) {
      next.leasingKmLimit = t("errors.leasingKmLimit");
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!validate()) return;
    onSubmit({
      label: label.trim(),
      leasingKmLimit: Number(kmLimit),
      leasingEndDate: endDate ? endDate : null,
    });
  }

  const fieldClass =
    "mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:outline-none";

  return (
    <form className="max-w-lg space-y-4" onSubmit={handleSubmit} noValidate>
      <div>
        <label htmlFor="label" className="block text-sm font-medium text-gray-700">
          {t("label")}
        </label>
        <input id="label" value={label} onChange={(e) => setLabel(e.target.value)} className={fieldClass} />
        {errors.label ? <p className="mt-1 text-sm text-red-600">{errors.label}</p> : null}
      </div>

      <div>
        <label htmlFor="kmLimit" className="block text-sm font-medium text-gray-700">
          {t("leasingKmLimit")}
        </label>
        <input
          id="kmLimit"
          type="number"
          min={LIMITS.km.min}
          value={kmLimit}
          onChange={(e) => setKmLimit(e.target.value)}
          className={fieldClass}
        />
        {errors.leasingKmLimit ? (
          <p className="mt-1 text-sm text-red-600">{errors.leasingKmLimit}</p>
        ) : null}
      </div>

      <div>
        <label htmlFor="endDate" className="block text-sm font-medium text-gray-700">
          {t("leasingEndDate")}
        </label>
        <input
          id="endDate"
          type="date"
          value={endDate}
          onChange={(e) => setEndDate(e.target.value)}
          className={fieldClass}
        />
        <p className="mt-1 text-xs text-gray-500">{t("leasingEndDateHint")}</p>
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
