"use client";

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { useAuth } from "@/lib/auth/auth-context";
import { canAccessAdminPanel } from "@/lib/auth/permissions";

/**
 * Plattform-Bereich. Nur SUPER_ADMIN.
 *
 * Die Prüfung hier ist Bequemlichkeit, keine Absicherung: sie erspart einer
 * falschen Rolle eine Seite voller Fehlermeldungen. Die eigentliche Sperre
 * sitzt im Backend (requireSuperAdmin), und ohne sie brächte diese Datei
 * nichts – die Daten kämen über die API trotzdem.
 */
const TABS = [
  { href: "/admin", key: "dashboard" },
  { href: "/admin/organizations", key: "organizations" },
  { href: "/admin/audit-logs", key: "auditLogs" },
] as const;

export default function AdminLayout({ children }: { children: ReactNode }) {
  const t = useTranslations("admin");
  const pathname = usePathname();
  const { user, status } = useAuth();

  if (status === "loading") {
    return <p className="text-sm text-gray-500">{t("loading")}</p>;
  }

  if (!canAccessAdminPanel(user?.role)) {
    return (
      <section data-testid="admin-forbidden" className="mx-auto max-w-lg py-16 text-center">
        <p className="text-5xl font-bold text-gray-300">403</p>
        <h1 className="mt-4 text-xl font-semibold text-gray-900">{t("forbidden.title")}</h1>
        <p className="mt-2 text-sm text-gray-600">{t("forbidden.body")}</p>
        <Link
          href="/dashboard"
          className="mt-6 inline-block rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-gray-700"
        >
          {t("forbidden.back")}
        </Link>
      </section>
    );
  }

  return (
    <section>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-gray-900">{t("title")}</h1>
        <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-800">
          {t("scopeWarning")}
        </span>
      </div>

      <nav className="mt-4 flex gap-1 border-b border-gray-200">
        {TABS.map((tab) => {
          const active = pathname === tab.href;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`-mb-px border-b-2 px-4 py-2 text-sm transition ${
                active
                  ? "border-gray-900 font-medium text-gray-900"
                  : "border-transparent text-gray-500 hover:text-gray-800"
              }`}
            >
              {t(`tabs.${tab.key}`)}
            </Link>
          );
        })}
      </nav>

      <div className="mt-6">{children}</div>
    </section>
  );
}
