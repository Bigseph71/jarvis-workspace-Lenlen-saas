"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

interface FachkraftAccessDataProps {
  email: string;
  temporaryPassword: string;
  /** Abweichender Einleitungstext (z.B. nach einem Passwort-Reset). */
  hint?: string;
}

/**
 * Einmalige Anzeige der Zugangsdaten eines frisch angelegten Fachkraft-Kontos.
 * Das Passwort ist danach nirgends mehr abrufbar (nur der Argon2id-Hash liegt
 * in der Datenbank), deshalb der explizite Hinweis und die Kopierfunktion.
 */
export function FachkraftAccessData({ email, temporaryPassword, hint }: FachkraftAccessDataProps) {
  const t = useTranslations("caregivers.form");
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(temporaryPassword);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="rounded-md border border-gray-300 bg-gray-50 p-4">
      <p className="text-sm text-gray-700">{hint ?? t("accountCreatedHint")}</p>

      <dl className="mt-4 space-y-3">
        <div>
          <dt className="text-sm font-medium text-gray-700">{t("accountEmail")}</dt>
          <dd className="mt-1 font-mono text-sm text-gray-900">{email}</dd>
        </div>
        <div>
          <dt className="text-sm font-medium text-gray-700">{t("accountPassword")}</dt>
          <dd className="mt-1 font-mono text-lg tracking-wide text-gray-900">
            {temporaryPassword}
          </dd>
        </div>
      </dl>

      <button
        type="button"
        onClick={handleCopy}
        className="mt-4 rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 transition hover:bg-gray-100"
      >
        {copied ? t("accountCopied") : t("accountCopy")}
      </button>
    </div>
  );
}
