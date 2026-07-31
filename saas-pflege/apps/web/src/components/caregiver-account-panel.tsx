"use client";

import { useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import {
  createFachkraftAccount,
  resetFachkraftPassword,
  ApiError,
  type UserRole,
} from "@len-len/api-client";
import { FachkraftAccessData } from "./fachkraft-access-data";

// Spiegelt die Rollen, die das Backend auf /users/* zulässt – damit kein
// Button erscheint, der beim Klick zwangsläufig 403 liefert.
const ACCOUNT_MANAGER_ROLES: readonly UserRole[] = ["SUPER_ADMIN", "STRUKTUR_ADMIN", "HR"];

// Bewusst permissiv: die verbindliche Prüfung macht Zod im Backend.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface CaregiverAccountPanelProps {
  caregiverId: string;
  /** Bereits verknüpftes Konto, null solange kein App-Zugang besteht. */
  account: { id: string; email: string } | null;
  currentRole: UserRole | undefined;
}

/** Frisch erzeugte Zugangsdaten – aus dem Anlegen oder aus einem Reset. */
interface IssuedCredentials {
  email: string;
  temporaryPassword: string;
  source: "created" | "reset";
}

const fieldClass =
  "mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:outline-none";

/**
 * App-Zugang einer bestehenden Fachkraft: zeigt das verknüpfte Konto, legt
 * eines nach (für ohne E-Mail angelegte Fachkräfte) oder setzt das Passwort
 * zurück, wenn das temporäre Passwort nie ankam.
 */
export function CaregiverAccountPanel({
  caregiverId,
  account,
  currentRole,
}: CaregiverAccountPanelProps) {
  const t = useTranslations("caregivers");

  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [issued, setIssued] = useState<IssuedCredentials | null>(null);

  const canManage = currentRole != null && ACCOUNT_MANAGER_ROLES.includes(currentRole);

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const mail = email.trim().toLowerCase();
    if (!EMAIL_PATTERN.test(mail) || mail.length > 254) {
      setError(t("errors.email"));
      return;
    }

    setError(null);
    setSubmitting(true);
    try {
      const result = await createFachkraftAccount({ caregiverId, email: mail });
      setIssued({
        email: result.user.email,
        temporaryPassword: result.temporaryPassword,
        source: "created",
      });
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 409
          ? t("account.emailTaken")
          : t("account.failed"),
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function handleReset(userId: string, accountEmail: string) {
    // Der Reset macht das laufende Passwort und alle Sitzungen ungültig –
    // deshalb bewusst mit Rückfrage.
    if (!window.confirm(t("account.resetConfirm", { email: accountEmail }))) return;

    setError(null);
    setSubmitting(true);
    try {
      const result = await resetFachkraftPassword(userId);
      setIssued({
        email: result.user.email,
        temporaryPassword: result.temporaryPassword,
        source: "reset",
      });
    } catch {
      setError(t("account.resetFailed"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="mt-8 max-w-lg border-t border-gray-200 pt-6">
      <h2 className="text-lg font-semibold text-gray-900">{t("account.title")}</h2>

      {issued ? (
        <div className="mt-3">
          <FachkraftAccessData
            email={issued.email}
            temporaryPassword={issued.temporaryPassword}
            hint={issued.source === "reset" ? t("account.resetHint") : undefined}
          />
        </div>
      ) : account ? (
        <div className="mt-2">
          <p className="text-sm text-gray-700">
            {t("account.existing")} <span className="font-mono">{account.email}</span>
          </p>
          {error ? (
            <p role="alert" className="mt-2 text-sm text-red-600">
              {error}
            </p>
          ) : null}
          {canManage ? (
            <button
              type="button"
              disabled={submitting}
              onClick={() => handleReset(account.id, account.email)}
              className="mt-3 rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 transition hover:bg-gray-100 disabled:opacity-50"
            >
              {submitting ? t("account.resetting") : t("account.reset")}
            </button>
          ) : null}
        </div>
      ) : !canManage ? (
        <p className="mt-2 text-sm text-gray-500">{t("account.none")}</p>
      ) : (
        <form className="mt-2 space-y-3" onSubmit={handleCreate} noValidate>
          <p className="text-sm text-gray-500">{t("account.none")}</p>

          <div>
            <label htmlFor="accountEmail" className="block text-sm font-medium text-gray-700">
              {t("fields.email")}
            </label>
            <input
              id="accountEmail"
              type="email"
              autoComplete="off"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={fieldClass}
            />
          </div>

          {error ? (
            <p role="alert" className="text-sm text-red-600">
              {error}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={submitting}
            className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-gray-700 disabled:opacity-50"
          >
            {submitting ? t("account.creating") : t("account.create")}
          </button>
        </form>
      )}
    </section>
  );
}
