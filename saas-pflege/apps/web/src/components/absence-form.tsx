"use client";

import { useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import {
  ABSENCE_TYPES,
  type AbsenceType,
  type Caregiver,
  type CreateAbsenceInput,
} from "@len-len/api-client";

interface AbsenceFormProps {
  caregivers: Caregiver[];
  submitting: boolean;
  error?: string | null;
  onSubmit: (input: CreateAbsenceInput) => void;
  onCancel: () => void;
}

type ErrorKey = "caregiverId" | "startDate" | "endDate";

const fieldClass =
  "mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:outline-none";

/** Erfassung einer Abwesenheit (POST /hr/absences). */
export function AbsenceForm({ caregivers, submitting, error, onSubmit, onCancel }: AbsenceFormProps) {
  const t = useTranslations("absences");

  const [caregiverId, setCaregiverId] = useState("");
  const [type, setType] = useState<AbsenceType>("VACATION");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [reason, setReason] = useState("");
  const [errors, setErrors] = useState<Partial<Record<ErrorKey, string>>>({});

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    // Vorprüfung nur für das, was ohne Server entscheidbar ist. Alles Weitere
    // (Überschneidung mit einer bestehenden Abwesenheit) weiß nur das Backend
    // und kommt als 422 mit Begründung zurück.
    const next: Partial<Record<ErrorKey, string>> = {};
    if (!caregiverId) next.caregiverId = t("errors.caregiver");
    if (!startDate) next.startDate = t("errors.startDate");
    if (!endDate) next.endDate = t("errors.endDate");
    else if (startDate && endDate < startDate) next.endDate = t("errors.endBeforeStart");

    if (Object.keys(next).length > 0) {
      setErrors(next);
      return;
    }

    setErrors({});
    onSubmit({
      caregiverId,
      type,
      startDate,
      endDate,
      ...(reason.trim() ? { reason: reason.trim() } : {}),
    });
  }

  return (
    <form className="max-w-lg space-y-4" onSubmit={handleSubmit} noValidate>
      <div>
        <label htmlFor="caregiverId" className="block text-sm font-medium text-gray-700">
          {t("fields.caregiver")}
        </label>
        <select
          id="caregiverId"
          value={caregiverId}
          onChange={(e) => setCaregiverId(e.target.value)}
          className={fieldClass}
        >
          <option value="">{t("fields.selectCaregiver")}</option>
          {caregivers.map((c) => (
            <option key={c.id} value={c.id}>
              {c.lastName}, {c.firstName}
            </option>
          ))}
        </select>
        {errors.caregiverId ? <p className="mt-1 text-sm text-red-600">{errors.caregiverId}</p> : null}
      </div>

      <div>
        <label htmlFor="absenceType" className="block text-sm font-medium text-gray-700">
          {t("fields.type")}
        </label>
        <select
          id="absenceType"
          value={type}
          onChange={(e) => setType(e.target.value as AbsenceType)}
          className={fieldClass}
        >
          {ABSENCE_TYPES.map((value) => (
            <option key={value} value={value}>
              {t(`types.${value}`)}
            </option>
          ))}
        </select>
      </div>

      <div className="flex gap-4">
        <div className="flex-1">
          <label htmlFor="startDate" className="block text-sm font-medium text-gray-700">
            {t("fields.startDate")}
          </label>
          <input
            id="startDate"
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className={fieldClass}
          />
          {errors.startDate ? <p className="mt-1 text-sm text-red-600">{errors.startDate}</p> : null}
        </div>
        <div className="flex-1">
          <label htmlFor="endDate" className="block text-sm font-medium text-gray-700">
            {t("fields.endDate")}
          </label>
          <input
            id="endDate"
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className={fieldClass}
          />
          {errors.endDate ? <p className="mt-1 text-sm text-red-600">{errors.endDate}</p> : null}
        </div>
      </div>

      <div>
        <label htmlFor="reason" className="block text-sm font-medium text-gray-700">
          {t("fields.reason")}
        </label>
        <input
          id="reason"
          type="text"
          maxLength={500}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className={fieldClass}
        />
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
