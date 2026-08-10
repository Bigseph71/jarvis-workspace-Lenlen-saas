"use client";

import { useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { useAuth } from "@/lib/auth/auth-context";
import { ApiError } from "@len-len/api-client";

// Muss zu passwordSchema im Backend passen (auth.schemas.ts).
const MIN_PASSWORD_LENGTH = 12;
const PASSWORD_RULES = [/[a-z]/, /[A-Z]/, /[0-9]/];

/**
 * Selbstregistrierung einer Organisation.
 *
 * Öffentlich, also außerhalb von (protected). Das Backend legt Organisation
 * und ersten Struktur-Admin in einer Transaktion an und gibt bereits ein
 * Token-Paar zurück – ein zweiter Anmeldeschritt entfällt.
 */
export default function RegisterPage() {
  const t = useTranslations("auth.register");
  const tc = useTranslations("common");
  const router = useRouter();
  const { register } = useAuth();

  const [organizationName, setOrganizationName] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    // Vorprüfung im Browser: dieselben Regeln wie im Backend, nur früher.
    // Sie ersetzt die serverseitige Prüfung nicht, erspart aber eine
    // Rundreise für einen Fehler, den man sofort sehen kann.
    if (password.length < MIN_PASSWORD_LENGTH || !PASSWORD_RULES.every((r) => r.test(password))) {
      setError(t("passwordRules", { min: MIN_PASSWORD_LENGTH }));
      return;
    }
    if (password !== confirmation) {
      setError(t("passwordMismatch"));
      return;
    }

    setSubmitting(true);
    try {
      await register({
        organizationName: organizationName.trim(),
        adminEmail: adminEmail.trim(),
        adminPassword: password,
      });
      // Zur Planwahl, nicht ins Dashboard: ohne hinterlegtes Zahlungsmittel
      // ist der Tenant gesperrt und könnte dort nichts anlegen.
      router.replace("/billing");
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setError(t("emailTaken"));
      } else if (err instanceof ApiError && err.status === 429) {
        // Der Endpunkt ist eng limitiert (10/min): ohne eigene Meldung wirkte
        // die Sperre wie ein Serverfehler.
        setError(t("tooManyAttempts"));
      } else if (err instanceof ApiError && err.status === 400) {
        setError(t("invalidInput"));
      } else {
        setError(tc("errorGeneric"));
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 p-4">
      <div className="w-full max-w-md rounded-xl border border-gray-200 bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-bold text-gray-900">{t("title")}</h1>
        <p className="mt-1 text-sm text-gray-500">{t("subtitle")}</p>

        <form className="mt-6 space-y-4" onSubmit={onSubmit}>
          <div>
            <label htmlFor="organizationName" className="block text-sm font-medium text-gray-700">
              {t("organizationName")}
            </label>
            <input
              id="organizationName"
              type="text"
              autoComplete="organization"
              required
              minLength={2}
              maxLength={120}
              value={organizationName}
              onChange={(e) => setOrganizationName(e.target.value)}
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:outline-none"
            />
          </div>

          <div>
            <label htmlFor="adminEmail" className="block text-sm font-medium text-gray-700">
              {t("adminEmail")}
            </label>
            <input
              id="adminEmail"
              type="email"
              autoComplete="email"
              required
              value={adminEmail}
              onChange={(e) => setAdminEmail(e.target.value)}
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:outline-none"
            />
            <p className="mt-1 text-xs text-gray-500">{t("adminEmailHint")}</p>
          </div>

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
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:outline-none"
            />
            <p className="mt-1 text-xs text-gray-500">
              {t("passwordRules", { min: MIN_PASSWORD_LENGTH })}
            </p>
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
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:outline-none"
            />
          </div>

          {error ? <p className="text-sm text-red-600">{error}</p> : null}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-gray-700 disabled:opacity-40"
          >
            {submitting ? t("submitting") : t("submit")}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-gray-500">
          {t("haveAccount")}{" "}
          <Link href="/login" className="font-medium text-gray-900 underline-offset-2 hover:underline">
            {t("toLogin")}
          </Link>
        </p>
      </div>
    </main>
  );
}
