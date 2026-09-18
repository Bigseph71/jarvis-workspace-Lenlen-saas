"use client";

import { useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import {
  createFachkraftAccount,
  reissueInvitation,
  ApiError,
  type UserRole,
} from "@len-len/api-client";
import { FachkraftInvitation } from "./fachkraft-invitation";

// Spiegelt die Rollen, die das Backend auf /users/* zulässt – damit kein
// Button erscheint, der beim Klick zwangsläufig 403 liefert.
const ACCOUNT_MANAGER_ROLES: readonly UserRole[] = ["STRUKTUR_ADMIN", "HR"];

// Bewusst permissiv: die verbindliche Prüfung macht Zod im Backend.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface CaregiverAccountPanelProps {
  caregiverId: string;
  /** Bereits verknüpftes Konto, null solange kein App-Zugang besteht. */
  account: { id: string; email: string } | null;
  currentRole: UserRole | undefined;
}

/** Frisch ausgestellte Einladung – aus dem Anlegen oder aus einem Neuausstellen. */
interface IssuedInvitation {
  email: string;
  invitationUrl: string;
  invitationExpiresAt: string;
  source: "created" | "reissued";
}

const fieldClass =
  "mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:outline-none";

/**
 * App-Zugang einer bestehenden Fachkraft: zeigt das verknüpfte Konto, legt
 * eines nach (für ohne E-Mail angelegte Fachkräfte) oder stellt einen neuen
 * Einladungslink aus, wenn der erste nie ankam oder das Gerät verloren ging.
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
  const [issued, setIssued] = useState<IssuedInvitation | null>(null);

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
        invitationUrl: result.invitationUrl,
        invitationExpiresAt: result.invitationExpiresAt,
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

  async function handleReissue(userId: string, accountEmail: string) {
    // Ein neuer Link beendet alle laufenden Sitzungen und entwertet den
    // vorherigen Link – deshalb bewusst mit Rückfrage.
    if (!window.confirm(t("account.inviteConfirm", { email: accountEmail }))) return;

    setError(null);
    setSubmitting(true);
    try {
      const result = await reissueInvitation(userId);
      setIssued({
        email: result.user.email,
        invitationUrl: result.invitationUrl,
        invitationExpiresAt: result.invitationExpiresAt,
        source: "reissued",
      });
    } catch {
      setError(t("account.inviteFailed"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="mt-8 max-w-lg border-t border-gray-200 pt-6">
      <h2 className="text-lg font-semibold text-gray-900">{t("account.title")}</h2>

      {issued ? (
        <div className="mt-3">
          <FachkraftInvitation
            email={issued.email}
            invitationUrl={issued.invitationUrl}
            invitationExpiresAt={issued.invitationExpiresAt}
            hint={issued.source === "reissued" ? t("account.inviteHint") : undefined}
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
              onClick={() => handleReissue(account.id, account.email)}
              className="mt-3 rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 transition hover:bg-gray-100 disabled:opacity-50"
            >
              {submitting ? t("account.inviting") : t("account.invite")}
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
