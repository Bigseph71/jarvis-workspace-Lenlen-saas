"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { useParams } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { LocaleSwitcher } from "@/components/locale-switcher";
// Öffentliche Seite ausserhalb des angemeldeten Bereichs: der API-Client wird
// sonst nur über auth-context.tsx konfiguriert, und der kommt hier nicht vor.
import "@/lib/api-setup";
import {
  ApiError,
  acceptInvitation,
  previewInvitation,
  type InvitationPreview,
} from "@len-len/api-client";

/**
 * Einladungsbildschirm: hier setzt die Fachkraft ihr Passwort.
 *
 * Öffentlich und ohne Anmeldung – der Link IST der Ausweis. Am Ende wird
 * bewusst NICHT angemeldet: Fachkräfte arbeiten in der App, im Web hätten sie
 * auf keinen Endpunkt Zugriff. Der Schlussbildschirm schickt sie deshalb in
 * die App und nicht auf ein Dashboard, das sie nicht öffnen dürfte.
 *
 * Die Seite wird meist auf einem Telefon geöffnet, weil der Link per Nachricht
 * ankommt. Ein schmales Layout ohne Navigation ist also der Normalfall, nicht
 * die Ausnahme.
 */

// Spiegelt invitation.schemas.ts im Backend. Doppelt geprüft, mit Absicht:
// hier für die sofortige Rückmeldung, dort verbindlich.
const MIN_LENGTH = 12;

function passwordIssue(value: string): "tooShort" | "missingClass" | null {
  if (value.length < MIN_LENGTH) return "tooShort";
  if (!/[a-z]/.test(value) || !/[A-Z]/.test(value) || !/[0-9]/.test(value)) {
    return "missingClass";
  }
  return null;
}

type Status = "loading" | "ready" | "invalid" | "done";

const fieldClass =
  "mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:outline-none";

export default function InvitationPage() {
  const t = useTranslations("invitation");
  const tc = useTranslations("common");
  const params = useParams<{ token: string }>();
  const token = params.token;

  const [status, setStatus] = useState<Status>("loading");
  const [preview, setPreview] = useState<InvitationPreview | null>(null);
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let active = true;
    previewInvitation(token)
      .then((result) => {
        if (!active) return;
        setPreview(result);
        setStatus("ready");
      })
      .catch(() => {
        // Abgelaufen, schon benutzt oder erfunden: das Backend unterscheidet
        // die Fälle nicht, und diese Seite soll es auch nicht.
        if (!active) return;
        setStatus("invalid");
      });
    return () => {
      active = false;
    };
  }, [token]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const issue = passwordIssue(password);
    if (issue) {
      setError(t(issue === "tooShort" ? "errors.tooShort" : "errors.missingClass"));
      return;
    }
    if (password !== confirmation) {
      setError(t("errors.mismatch"));
      return;
    }

    setError(null);
    setSubmitting(true);
    try {
      await acceptInvitation(token, password);
      setStatus("done");
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        // Zwischen dem Öffnen und dem Absenden abgelaufen oder von jemand
        // anderem eingelöst.
        setStatus("invalid");
      } else if (err instanceof ApiError && err.status === 400) {
        setError(t("errors.missingClass"));
      } else {
        setError(tc("errorGeneric"));
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 p-4">
      <div className="w-full max-w-sm rounded-xl border border-gray-200 bg-white p-8 shadow-sm">
        <div className="mb-4 flex justify-end">
          <LocaleSwitcher />
        </div>

        {status === "loading" ? <p className="text-sm text-gray-500">{tc("loading")}</p> : null}

        {status === "invalid" ? (
          <>
            <h1 className="text-2xl font-bold text-gray-900">{t("invalidTitle")}</h1>
            <p className="mt-2 text-sm text-gray-600">{t("invalidHint")}</p>
          </>
        ) : null}

        {status === "done" ? (
          <>
            <h1 className="text-2xl font-bold text-gray-900">{t("doneTitle")}</h1>
            <p className="mt-2 text-sm text-gray-600">{t("doneHint")}</p>
            <Link
              href="/login"
              className="mt-6 inline-block rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 transition hover:bg-gray-100"
            >
              {t("toLogin")}
            </Link>
          </>
        ) : null}

        {status === "ready" && preview ? (
          <>
            <h1 className="text-2xl font-bold text-gray-900">{t("title")}</h1>
            <p className="mt-1 text-sm text-gray-500">
              {t("subtitle", { organization: preview.organizationName })}
            </p>
            <p className="mt-3 font-mono text-sm text-gray-900">{preview.email}</p>

            <form className="mt-6 space-y-4" onSubmit={onSubmit} noValidate>
              <div>
                <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                  {t("password")}
                </label>
                <input
                  id="password"
                  type="password"
                  autoComplete="new-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={fieldClass}
                />
                <p className="mt-1 text-xs text-gray-500">{t("passwordRule")}</p>
              </div>

              <div>
                <label htmlFor="confirmation" className="block text-sm font-medium text-gray-700">
                  {t("confirmation")}
                </label>
                <input
                  id="confirmation"
                  type="password"
                  autoComplete="new-password"
                  required
                  value={confirmation}
                  onChange={(e) => setConfirmation(e.target.value)}
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
                className="w-full rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-gray-700 disabled:opacity-50"
              >
                {submitting ? t("submitting") : t("submit")}
              </button>
            </form>
          </>
        ) : null}
      </div>
    </main>
  );
}
