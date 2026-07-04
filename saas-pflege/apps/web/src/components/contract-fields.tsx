"use client";

import { useTranslations } from "next-intl";
import type { ContractInput, ContractType, WeekDay } from "@len-len/api-client";

/** Formularwerte: Zahlen als Strings (DOM-Inputs), beim Submit geparst. */
export interface ContractFieldsValue {
  contractType: ContractType;
  weeklyHours: string;
  workDays: WeekDay[];
  maxPatients: string;
}

export type ContractErrorKey = "weeklyHours" | "workDays" | "maxPatients";

export const CONTRACT_TYPES: ContractType[] = ["FULL_100", "PART_80", "PART_50", "MINIJOB", "CUSTOM"];
export const WEEK_DAYS: WeekDay[] = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];

export const EMPTY_CONTRACT: ContractFieldsValue = {
  contractType: "FULL_100",
  weeklyHours: "",
  workDays: [],
  maxPatients: "",
};

/** Validierung spiegelt das Backend (contractFields in caregiver.schemas.ts). */
export function validateContract(value: ContractFieldsValue): {
  errors: Partial<Record<ContractErrorKey, true>>;
  parsed: ContractInput | null;
} {
  const errors: Partial<Record<ContractErrorKey, true>> = {};

  const weeklyHours = Number(value.weeklyHours);
  if (!Number.isFinite(weeklyHours) || weeklyHours <= 0 || weeklyHours > 60) {
    errors.weeklyHours = true;
  }
  if (value.workDays.length < 1 || value.workDays.length > 7) {
    errors.workDays = true;
  }
  const maxPatients = Number(value.maxPatients);
  if (!Number.isInteger(maxPatients) || maxPatients < 0 || maxPatients > 500) {
    errors.maxPatients = true;
  }

  if (Object.keys(errors).length > 0) return { errors, parsed: null };
  return {
    errors,
    parsed: { contractType: value.contractType, weeklyHours, workDays: value.workDays, maxPatients },
  };
}

interface ContractFieldsProps {
  value: ContractFieldsValue;
  onChange: (value: ContractFieldsValue) => void;
  errors: Partial<Record<ContractErrorKey, string>>;
}

const fieldClass =
  "mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:outline-none";

/** Wiederverwendbarer Vertrags-Block (Anlegen + Vertrag bearbeiten). */
export function ContractFields({ value, onChange, errors }: ContractFieldsProps) {
  const t = useTranslations("caregivers");

  function toggleDay(day: WeekDay) {
    const next = value.workDays.includes(day)
      ? value.workDays.filter((d) => d !== day)
      : [...value.workDays, day];
    onChange({ ...value, workDays: next });
  }

  return (
    <>
      <div>
        <label htmlFor="contractType" className="block text-sm font-medium text-gray-700">
          {t("fields.contractType")}
        </label>
        <select
          id="contractType"
          value={value.contractType}
          onChange={(e) => onChange({ ...value, contractType: e.target.value as ContractType })}
          className={fieldClass}
        >
          {CONTRACT_TYPES.map((ct) => (
            <option key={ct} value={ct}>
              {t(`contractTypes.${ct}`)}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="weeklyHours" className="block text-sm font-medium text-gray-700">
          {t("fields.weeklyHours")}
        </label>
        <input
          id="weeklyHours"
          type="number"
          min={0}
          max={60}
          step="0.5"
          value={value.weeklyHours}
          onChange={(e) => onChange({ ...value, weeklyHours: e.target.value })}
          className={fieldClass}
        />
        {errors.weeklyHours ? <p className="mt-1 text-sm text-red-600">{errors.weeklyHours}</p> : null}
      </div>

      <div>
        <span className="block text-sm font-medium text-gray-700">{t("fields.workDays")}</span>
        <div className="mt-2 flex flex-wrap gap-2">
          {WEEK_DAYS.map((day) => {
            const checked = value.workDays.includes(day);
            return (
              <button
                key={day}
                type="button"
                onClick={() => toggleDay(day)}
                aria-pressed={checked}
                className={`rounded-md border px-3 py-1.5 text-sm transition ${
                  checked
                    ? "border-gray-900 bg-gray-900 text-white"
                    : "border-gray-300 text-gray-700 hover:bg-gray-100"
                }`}
              >
                {t(`weekdays.${day}`)}
              </button>
            );
          })}
        </div>
        {errors.workDays ? <p className="mt-1 text-sm text-red-600">{errors.workDays}</p> : null}
      </div>

      <div>
        <label htmlFor="maxPatients" className="block text-sm font-medium text-gray-700">
          {t("fields.maxPatients")}
        </label>
        <input
          id="maxPatients"
          type="number"
          min={0}
          max={500}
          step="1"
          value={value.maxPatients}
          onChange={(e) => onChange({ ...value, maxPatients: e.target.value })}
          className={fieldClass}
        />
        {errors.maxPatients ? <p className="mt-1 text-sm text-red-600">{errors.maxPatients}</p> : null}
      </div>
    </>
  );
}
