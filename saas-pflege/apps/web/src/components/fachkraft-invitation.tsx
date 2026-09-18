"use client";

import { useState } from "react";
import { useFormatter, useTranslations } from "next-intl";

interface FachkraftInvitationProps {
  email: string;
  invitationUrl: string;
  invitationExpiresAt: string;
  /** Abweichender Einleitungstext (z.B. beim erneuten Ausstellen). */
  hint?: string;
}

/**
 * Einmalige Anzeige des Einladungslinks eines Fachkraft-Kontos.
 *
 * Hier stand bis zuletzt ein temporäres Passwort. Der Unterschied ist nicht
 * kosmetisch: ein Passwort, das der Admin abliest, kennt der Admin – er kann
 * sich damit vor der Fachkraft in ihrem Namen anmelden, und was danach unter
 * ihrem Namen im Audit-Log steht, ist ihr nicht mehr sicher zuzurechnen. Über
 * den Link wählt sie ihr Passwort selbst.
 *
 * Der Link ist trotzdem ein Geheimnis: wer ihn hat, kann das Konto
 * übernehmen, solange er gilt. Deshalb steht das Ablaufdatum daneben – es ist
 * die Information, die entscheidet, ob man ihn noch verschicken darf oder
 * einen neuen ausstellt.
 */
export function FachkraftInvitation({
  email,
  invitationUrl,
  invitationExpiresAt,
  hint,
}: FachkraftInvitationProps) {
  const t = useTranslations("caregivers.form");
  const format = useFormatter();
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(invitationUrl);
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
          <dt className="text-sm font-medium text-gray-700">{t("accountLink")}</dt>
          {/* break-all: der Link ist lang und darf die Karte nicht sprengen. */}
          <dd className="mt-1 break-all font-mono text-sm text-gray-900">{invitationUrl}</dd>
        </div>
        <div>
          <dt className="text-sm font-medium text-gray-700">{t("accountExpires")}</dt>
          <dd className="mt-1 text-sm text-gray-900">
            {format.dateTime(new Date(invitationExpiresAt), {
              dateStyle: "medium",
              timeStyle: "short",
            })}
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
