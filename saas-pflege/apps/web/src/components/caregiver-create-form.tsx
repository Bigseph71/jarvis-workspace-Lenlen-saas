"use client";

import { useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import {
  ContractFields,
  EMPTY_CONTRACT,
  validateContract,
  type ContractErrorKey,
  type ContractFieldsValue,
} from "./contract-fields";
import type { CreateCaregiverInput, Qualification } from "@len-len/api-client";

const QUALIFICATIONS: Qualification[] = [
  "PFLEGEFACHKRAFT",
  "PFLEGEHILFSKRAFT",
  "BETREUUNGSKRAFT",
  "AUSZUBILDENDE",
];

/**
 * Beim Anlegen entsteht immer die Fachkraft, das Login-Konto nur bei
 * angegebener E-Mail (z.B. Auszubildende brauchen keinen App-Zugang).
 * Das temporäre Passwort erzeugt das Backend, nie der Client.
 */
export interface CaregiverCreateSubmit {
  caregiver: CreateCaregiverInput;
  /** undefined = kein Konto anlegen. */
  email?: string;
}

interface CaregiverCreateFormProps {
  submitting: boolean;
  error?: string | null;
  onSubmit: (input: CaregiverCreateSubmit) => void;
  onCancel: () => void;
}

// Bewusst permissiv: die verbindliche Prüfung macht Zod im Backend.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const fieldClass =
  "mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:outline-none";

/** Anlegen einer Fachkraft inkl. Pflicht-Vertrag (Regel métier 5). */
export function CaregiverCreateForm({ submitting, error, onSubmit, onCancel }: CaregiverCreateFormProps) {
  const t = useTranslations("caregivers");

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [qualification, setQualification] = useState<Qualification>("PFLEGEFACHKRAFT");
  const [contract, setContract] = useState<ContractFieldsValue>(EMPTY_CONTRACT);

  const [idErrors, setIdErrors] = useState<
    Partial<Record<"firstName" | "lastName" | "email", string>>
  >({});
  const [contractErrors, setContractErrors] = useState<Partial<Record<ContractErrorKey, string>>>({});

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const fn = firstName.trim();
    const ln = lastName.trim();
    const mail = email.trim().toLowerCase();
    const nextIdErrors: typeof idErrors = {};
    if (fn.length < 1 || fn.length > 80) nextIdErrors.firstName = t("errors.firstName");
    if (ln.length < 1 || ln.length > 80) nextIdErrors.lastName = t("errors.lastName");
    // Optional: nur prüfen, wenn überhaupt etwas eingetragen wurde.
    if (mail && (!EMAIL_PATTERN.test(mail) || mail.length > 254)) {
      nextIdErrors.email = t("errors.email");
    }

    const { errors: rawContract, parsed } = validateContract(contract);
    const nextContractErrors: typeof contractErrors = {
      weeklyHours: rawContract.weeklyHours ? t("errors.weeklyHours") : undefined,
      workDays: rawContract.workDays ? t("errors.workDays") : undefined,
      maxPatients: rawContract.maxPatients ? t("errors.maxPatients") : undefined,
    };

    setIdErrors(nextIdErrors);
    setContractErrors(nextContractErrors);

    if (Object.keys(nextIdErrors).length > 0 || !parsed) return;
    onSubmit({
      caregiver: { firstName: fn, lastName: ln, qualification, ...parsed },
      email: mail || undefined,
    });
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
        {idErrors.firstName ? <p className="mt-1 text-sm text-red-600">{idErrors.firstName}</p> : null}
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
        {idErrors.lastName ? <p className="mt-1 text-sm text-red-600">{idErrors.lastName}</p> : null}
      </div>

      <div>
        <label htmlFor="email" className="block text-sm font-medium text-gray-700">
          {t("fields.email")}{" "}
          <span className="font-normal text-gray-500">{t("form.optional")}</span>
        </label>
        <input
          id="email"
          type="email"
          autoComplete="off"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={fieldClass}
        />
        <p className="mt-1 text-xs text-gray-500">{t("form.accountHint")}</p>
        {idErrors.email ? <p className="mt-1 text-sm text-red-600">{idErrors.email}</p> : null}
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

      <ContractFields value={contract} onChange={setContract} errors={contractErrors} />

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
          {submitting ? t("form.saving") : t("form.create")}
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
