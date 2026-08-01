"use client";

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import type { UserRole } from "@len-len/api-client";
import { Link, usePathname } from "@/i18n/navigation";
import { useAuth } from "@/lib/auth/auth-context";

// Navigationspunkte des angemeldeten Bereichs. `roles` beschränkt die Sichtbarkeit.
interface NavItem {
  href: string;
  key: string;
  roles?: readonly UserRole[];
}

const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", key: "dashboard" },
  { href: "/patients", key: "patients" },
  { href: "/caregivers", key: "caregivers" },
  { href: "/visits", key: "visits" },
  // HR: Abwesenheiten. Lesen darf auch die Koordination, die Planung hängt davon ab.
  { href: "/absences", key: "absences", roles: ["SUPER_ADMIN", "STRUKTUR_ADMIN", "HR", "KOORDINATOR"] },
  { href: "/planung", key: "tracking", roles: ["SUPER_ADMIN", "STRUKTUR_ADMIN", "KOORDINATOR"] },
  { href: "/chat", key: "chat", roles: ["SUPER_ADMIN", "STRUKTUR_ADMIN", "KOORDINATOR"] },
  { href: "/leasing", key: "leasing", roles: ["SUPER_ADMIN", "STRUKTUR_ADMIN"] },
  { href: "/billing", key: "billing", roles: ["SUPER_ADMIN", "STRUKTUR_ADMIN"] },
];

/** Rahmen für angemeldete Seiten: Kopfzeile mit Navigation + Abmelden. */
export function AppShell({ children }: { children: ReactNode }) {
  const tc = useTranslations("common");
  const tn = useTranslations("nav");
  const { user, logout } = useAuth();
  const pathname = usePathname();

  const navItems = NAV_ITEMS.filter(
    (item) => !item.roles || (user != null && item.roles.includes(user.role)),
  );

  return (
    <div className="min-h-screen bg-gray-50">
      {/*
        Kopfzeile auf EINER Zeile, in jeder Sprache. Zwei Regeln tragen das:
        `whitespace-nowrap` verhindert, dass ein Label in sich umbricht
        ("Echtzeit-Tracking", "Tableau de bord"), und `overflow-x-auto` lässt
        die Navigation notfalls scrollen, statt die Kopfzeile zu verdoppeln.
        Ohne das zweite würde der nächste Menüpunkt den Umbruch zurückholen.
      */}
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-6 py-3">
          <div className="flex min-w-0 items-center gap-5">
            <span className="whitespace-nowrap font-semibold text-gray-900">{tc("appName")}</span>
            <nav className="flex min-w-0 gap-0.5 overflow-x-auto">
              {navItems.map((item) => {
                const active = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`whitespace-nowrap rounded-md px-2 py-1.5 text-sm transition ${
                      active
                        ? "bg-gray-900 text-white"
                        : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                    }`}
                  >
                    {tn(item.key)}
                  </Link>
                );
              })}
            </nav>
          </div>
          <button
            type="button"
            onClick={() => void logout()}
            className="shrink-0 whitespace-nowrap rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 transition hover:bg-gray-100"
          >
            {tc("logout")}
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-5xl p-6">{children}</main>
    </div>
  );
}
