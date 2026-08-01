"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
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

/**
 * Sichtbar bleiben die Stammdaten und die Planung – das, was täglich
 * angefasst wird.
 */
const PRIMARY_ITEMS: NavItem[] = [
  { href: "/dashboard", key: "dashboard" },
  { href: "/patients", key: "patients" },
  { href: "/caregivers", key: "caregivers" },
  { href: "/visits", key: "visits" },
  // HR: Abwesenheiten. Lesen darf auch die Koordination, die Planung hängt davon ab.
  { href: "/absences", key: "absences", roles: ["SUPER_ADMIN", "STRUKTUR_ADMIN", "HR", "KOORDINATOR"] },
];

/**
 * Ins Menü wandern die Werkzeuge und die Verwaltung: seltener aufgerufen, und
 * ihre Namen sind die längsten. Ohne diese Trennung wächst die Kopfzeile mit
 * jedem neuen Modul weiter (die Dienstpläne kommen noch).
 */
const SECONDARY_ITEMS: NavItem[] = [
  { href: "/planung", key: "tracking", roles: ["SUPER_ADMIN", "STRUKTUR_ADMIN", "KOORDINATOR"] },
  { href: "/chat", key: "chat", roles: ["SUPER_ADMIN", "STRUKTUR_ADMIN", "KOORDINATOR"] },
  { href: "/leasing", key: "leasing", roles: ["SUPER_ADMIN", "STRUKTUR_ADMIN"] },
  { href: "/billing", key: "billing", roles: ["SUPER_ADMIN", "STRUKTUR_ADMIN"] },
];

function visibleFor(items: NavItem[], role: UserRole | undefined): NavItem[] {
  return items.filter((item) => !item.roles || (role != null && item.roles.includes(role)));
}

const linkClass = (active: boolean): string =>
  `whitespace-nowrap rounded-md px-2 py-1.5 text-sm transition ${
    active ? "bg-gray-900 text-white" : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
  }`;

/** Aufklappmenü der Zweitrangigen. */
function MoreMenu({ items, pathname }: { items: NavItem[]; pathname: string }) {
  const tn = useTranslations("nav");
  const [open, setOpen] = useState(false);
  const container = useRef<HTMLDivElement>(null);

  // Enthält das Menü die aktuelle Seite? Dann wird der Auslöser hervorgehoben,
  // sonst verlöre man beim Aufklappen die Ortsangabe.
  const containsActive = items.some((item) => item.href === pathname);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent): void => {
      if (!container.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  // Nach einem Seitenwechsel schließen – der Klick auf einen Eintrag lässt die
  // Komponente sonst offen zurück.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  if (items.length === 0) return null;

  return (
    <div ref={container} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
        className={`${linkClass(containsActive)} flex items-center gap-1`}
      >
        {tn("more")}
        <svg
          aria-hidden="true"
          viewBox="0 0 20 20"
          className={`h-3 w-3 transition-transform ${open ? "rotate-180" : ""}`}
          fill="currentColor"
        >
          <path d="M5.5 7.5 10 12l4.5-4.5z" />
        </svg>
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute right-0 z-20 mt-1 min-w-44 rounded-md border border-gray-200 bg-white py-1 shadow-lg"
        >
          {items.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                role="menuitem"
                className={`block whitespace-nowrap px-3 py-2 text-sm transition ${
                  active ? "bg-gray-100 font-medium text-gray-900" : "text-gray-700 hover:bg-gray-50"
                }`}
              >
                {tn(item.key)}
              </Link>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

/** Rahmen für angemeldete Seiten: Kopfzeile mit Navigation + Abmelden. */
export function AppShell({ children }: { children: ReactNode }) {
  const tc = useTranslations("common");
  const tn = useTranslations("nav");
  const { user, logout } = useAuth();
  const pathname = usePathname();

  const primary = visibleFor(PRIMARY_ITEMS, user?.role);
  const secondary = visibleFor(SECONDARY_ITEMS, user?.role);

  return (
    <div className="min-h-screen bg-gray-50">
      {/*
        Kopfzeile auf EINER Zeile, in jeder Sprache. `whitespace-nowrap`
        verhindert, dass ein Label in sich umbricht; die zweitrangigen Punkte
        liegen im Menü, damit die Zeile beim nächsten Modul nicht wieder
        überläuft.

        KEIN overflow-x-auto auf der Navigation: es würde das aufgeklappte
        Menü abschneiden, das absolut darin positioniert ist. Der Platz kommt
        stattdessen aus der Aufteilung primär/sekundär – gemessen belegt die
        Leiste 479 von 763 px (Deutsch, Admin, breitester Fall).
      */}
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-6 py-3">
          <div className="flex min-w-0 items-center gap-5">
            <span className="whitespace-nowrap font-semibold text-gray-900">{tc("appName")}</span>
            <nav className="flex min-w-0 items-center gap-0.5">
              {primary.map((item) => (
                <Link key={item.href} href={item.href} className={linkClass(pathname === item.href)}>
                  {tn(item.key)}
                </Link>
              ))}
              <MoreMenu items={secondary} pathname={pathname} />
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
