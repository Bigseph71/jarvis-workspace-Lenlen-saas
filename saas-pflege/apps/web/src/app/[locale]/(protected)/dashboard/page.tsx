"use client";

import { useTranslations } from "next-intl";
import { useAuth } from "@/lib/auth/auth-context";

export default function DashboardPage() {
  const t = useTranslations("dashboard");
  const { user } = useAuth();

  if (!user) return null;

  return (
    <section>
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
  );
}
