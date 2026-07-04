"use client";

import { useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import {
  ContractFields,
  validateContract,
  type ContractErrorKey,
  type ContractFieldsValue,
} from "./contract-fields";
import type { ContractInput } from "@len-len/api-client";

interface ContractFormProps {
  initial: ContractFieldsValue;
  submitting: boolean;
  error?: string | null;
  onSubmit: (input: ContractInput) => void;
  onCancel: () => void;
}

/** Bearbeitung des Vertrags-Blocks einer bestehenden Fachkraft. */
export function ContractForm({ initial, submitting, error, onSubmit, onCancel }: ContractFormProps) {
  const t = useTranslations("caregivers");
  const [value, setValue] = useState<ContractFieldsValue>(initial);
  const [errors, setErrors] = useState<Partial<Record<ContractErrorKey, string>>>({});

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const { errors: raw, parsed } = validateContract(value);
    if (!parsed) {
      setErrors({
        weeklyHours: raw.weeklyHours ? t("errors.weeklyHours") : undefined,
        workDays: raw.workDays ? t("errors.workDays") : undefined,
        maxPatients: raw.maxPatients ? t("errors.maxPatients") : undefined,
      });
      return;
    }
    setErrors({});
    onSubmit(parsed);
  }

  return (
    <form className="max-w-lg space-y-4" onSubmit={handleSubmit} noValidate>
      <ContractFields value={value} onChange={setValue} errors={errors} />

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
