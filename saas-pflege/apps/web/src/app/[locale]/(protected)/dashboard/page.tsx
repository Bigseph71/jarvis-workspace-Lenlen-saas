"use client";

import { useTranslations } from "next-intl";
import { useAuth } from "@/lib/auth/auth-context";

export default function DashboardPage() {
  const t = useTranslations("dashboard");
  const tc = useTranslations("common");
  const { user, logout } = useAuth();

  if (!user) return null;

  return (
    <main className="min-h-screen bg-gray-50">
      <header className="flex items-center justify-between border-b border-gray-200 bg-white px-6 py-4">
        <span className="font-semibold text-gray-900">{tc("appName")}</span>
        <button
          type="button"
          onClick={() => void logout()}
          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 transition hover:bg-gray-100"
        >
          {tc("logout")}
        </button>
      </header>

      <section className="mx-auto max-w-2xl p-6">
        <h1 className="text-2xl font-bold text-gray-900">{t("title")}</h1>
        <p className="mt-2 text-gray-600">{t("welcome", { email: user.email })}</p>

        <dl className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <dt className="text-xs uppercase tracking-wide text-gray-400">{t("role")}</dt>
            <dd className="mt-1 text-sm font-medium text-gray-900">{user.role}</dd>
          </div>
          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <dt className="text-xs uppercase tracking-wide text-gray-400">{t("organization")}</dt>
            <dd className="mt-1 break-all text-sm font-medium text-gray-900">{user.organizationId}</dd>
          </div>
        </dl>
      </section>
    </main>
  );
}
