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
 *
 * Die dunkle Kopfzeile liegt eine Ebene höher, in der AppShell: sie hängt an
 * der ROLLE und gilt damit auch für die Fehlerseite unten. Ein 403 in hellem
 * Chrome sähe aus wie eine Organisationsansicht.
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
    return <p className="text-row text-ink-muted">{t("loading")}</p>;
  }

  if (!canAccessAdminPanel(user?.role)) {
    return (
      <section data-testid="admin-forbidden" className="mx-auto max-w-lg py-16 text-center">
        <p className="font-serif text-[54px] font-light leading-none text-neutral-dot">403</p>
        <h1 className="mt-4 font-serif text-[24px] font-normal text-ink-primary">
          {t("forbidden.title")}
        </h1>
        <p className="mt-2 text-row text-ink-secondary">{t("forbidden.body")}</p>
        <Link
          href="/dashboard"
          className="mt-6 inline-block rounded-full bg-clay px-5 py-3 text-row font-semibold text-on-clay shadow-primary transition-colors duration-120 hover:bg-clay-hover"
        >
          {t("forbidden.back")}
        </Link>
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="text-label font-semibold uppercase tracking-[.14em] text-ink-faint">
            {t("title")}
          </p>
          <h1 className="mt-2 font-serif text-[42px] font-light leading-[1.08] tracking-[-.02em] text-ink-primary">
            {t("headline")}
          </h1>
          {/*
            Der Satz ist kein Beiwerk: er sagt, WORÜBER dieser Bereich Auskunft
            gibt und worüber nicht. Die Zusicherung "keine Patientendaten"
            gehört sichtbar dorthin, wo jemand Kundendaten erwartet.
          */}
          <p className="mt-3 max-w-xl text-body text-ink-secondary">{t("scopeWarning")}</p>
        </div>

        <nav
          aria-label={t("title")}
          className="flex gap-1 rounded-full border border-strong bg-muted p-[5px]"
        >
          {TABS.map((tab) => {
            const active = pathname === tab.href;
            return (
              <Link
                key={tab.href}
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={`whitespace-nowrap rounded-full px-[18px] py-[9px] text-label-lg transition-colors duration-120 ${
                  active
                    ? "bg-app font-semibold text-ink-primary shadow-tab"
                    : "font-medium text-ink-tertiary hover:text-ink-body"
                }`}
              >
                {t(`tabs.${tab.key}`)}
              </Link>
            );
          })}
        </nav>
      </div>

      {children}
    </section>
  );
}
