"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useFormatter, useTranslations } from "next-intl";
import type { UserRole } from "@len-len/api-client";
import { Link, usePathname } from "@/i18n/navigation";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { BrandMark } from "@/components/brand-mark";
import { useAuth } from "@/lib/auth/auth-context";
import { initialsFromEmail, displayNameFromEmail } from "@/lib/display-name";
import { OPEN_ARBITRATIONS } from "@/lib/demo/planning-draft";
import { GPS_STATUS } from "@/lib/demo/planung";

// Navigationspunkte des angemeldeten Bereichs. `roles` beschränkt die Sichtbarkeit.
//
// Diese Listen spiegeln die requireRole()-Wächter des Backends. Sie sind KEINE
// Absicherung – die leistet das Backend – sondern verhindern, dass jemand einen
// Menüpunkt sieht, der ihm nur einen 403 liefert. Wer eine Route absichert,
// pflegt hier mit.
interface NavItem {
  href: string;
  key: string;
  roles?: readonly UserRole[];
  /** Zahl auf der Pastille (offene Arbitragen). 0 = keine Pastille. */
  badge?: number;
}

/** Rollen des jeweiligen Backend-Wächters, als benannte Konstanten. */
const PLANNING: readonly UserRole[] = ["STRUKTUR_ADMIN", "KOORDINATOR"];
const PLANNING_AND_HR: readonly UserRole[] = [...PLANNING, "HR"];

/**
 * Sichtbar bleiben die Stammdaten und die Planung – das, was täglich
 * angefasst wird.
 */
const PRIMARY_ITEMS: NavItem[] = [
  { href: "/dashboard", key: "dashboard" },
  // Patientendaten: laut RBAC-Tabelle nichts für die HR-Rolle
  // (patient.routes.ts: canManage).
  { href: "/patients", key: "patients", roles: PLANNING },
  // Fachkräfte: HR braucht sie für das Vertragsmodul (caregiver.routes.ts: canRead).
  { href: "/caregivers", key: "caregivers", roles: PLANNING_AND_HR },
  // Der Planungsarbeitsplatz (Karte, Gewinne, Arbitragen, Veröffentlichung).
  //
  // Bis zur Überarbeitung führte dieser Punkt auf /visits, die Wochenliste der
  // Besuche. Das sind zwei verschiedene Dinge: die Liste ist die Pflege
  // EINZELNER Termine (anlegen, absagen, umbesetzen), der Arbeitsplatz ist die
  // Arbeit am ganzen Entwurf. Der Handoff führt genau einen Punkt "Planung" in
  // der Leiste, und gemeint ist der Arbeitsplatz; die Liste rückt ins Menü.
  { href: "/planung", key: "visits", roles: PLANNING, badge: OPEN_ARBITRATIONS },
  // Abwesenheiten: HR pflegt sie, die Koordination liest sie – die Planung
  // hängt davon ab.
  { href: "/absences", key: "absences", roles: PLANNING_AND_HR },
];

/**
 * Ins Menü wandern die Werkzeuge und die Verwaltung: seltener aufgerufen, und
 * ihre Namen sind die längsten. Ohne diese Trennung wächst die Kopfzeile mit
 * jedem neuen Modul weiter (die Dienstpläne kommen noch).
 */
const SECONDARY_ITEMS: NavItem[] = [
  // Wochenliste der Besuche. Sie bleibt vollständig erreichbar – hier werden
  // einzelne Termine angelegt, abgesagt und umbesetzt, was der
  // Planungsarbeitsplatz nicht kann.
  { href: "/visits", key: "visitList", roles: PLANNING },
  // Gebietsaufteilung: geht der Optimierung voraus, gehört also zur Planung
  // (clustering.routes.ts: canPlan). Kein Untermenüpunkt von /tracking – das
  // ist Echtzeit-Überwachung, etwas ganz anderes.
  { href: "/clustering", key: "clustering", roles: PLANNING },
  { href: "/tracking", key: "tracking", roles: PLANNING },
  { href: "/chat", key: "chat", roles: PLANNING },
  { href: "/leasing", key: "leasing", roles: ["STRUKTUR_ADMIN"] },
  { href: "/billing", key: "billing", roles: ["STRUKTUR_ADMIN"] },
  // Betroffenenrechte. Die Auskunft steht laut export.routes.ts auch HR offen,
  // die Löschung NICHT: sie ist nicht umkehrbar und berührt die
  // Pflegedokumentation, deshalb nur die Admin-Ebene.
  { href: "/dsgvo/export", key: "dsgvoExport", roles: ["STRUKTUR_ADMIN", "HR"] },
  { href: "/dsgvo/erasure", key: "dsgvoErasure", roles: ["STRUKTUR_ADMIN"] },
];

/** Plattform-Verwaltung. Einziger Punkt des Super-Admins (siehe navigationFor). */
const ADMIN_ITEM: NavItem = { href: "/admin", key: "admin", roles: ["SUPER_ADMIN"] };

function visibleFor(items: NavItem[], role: UserRole | undefined): NavItem[] {
  return items.filter((item) => !item.roles || (role != null && item.roles.includes(role)));
}

/**
 * Navigation je Rolle.
 *
 * Der Super-Admin bekommt AUSSCHLIESSLICH die Plattform-Verwaltung – und das
 * deckt sich mit dem Backend: SUPER_ADMIN steht in keinem Wächter eines
 * Tenant-Moduls, diese Endpunkte antworten ihm mit 403 (Datenminimierung,
 * begründet in plugins/rbac.ts).
 */
function navigationFor(role: UserRole | undefined): { primary: NavItem[]; secondary: NavItem[] } {
  if (role === "SUPER_ADMIN") {
    return { primary: [ADMIN_ITEM], secondary: [] };
  }
  return { primary: visibleFor(PRIMARY_ITEMS, role), secondary: visibleFor(SECONDARY_ITEMS, role) };
}

/**
 * Zahl der offenen Arbitragen auf dem Planungspunkt.
 *
 * Die Tönung dreht sich um, sobald der Punkt aktiv ist: auf der gefüllten
 * `forest`-Pastille wäre die helle clay-Fassung nicht mehr zu lesen.
 */
function NavBadge({ count, active }: { count: number; active: boolean }) {
  const t = useTranslations("nav");
  return (
    <>
      {/*
        Die Ziffer ist für das AUGE. Vorgelesen ergäbe "Planung 2" nichts –
        zwei was? Deshalb trägt sie `aria-hidden`, und der Satz daneben steht
        nur für die Sprachausgabe. `sr-only` blendet ihn optisch aus, ohne ihn
        aus dem Barrierebaum zu nehmen (anders als `display: none`).
      */}
      <span
        data-nav-badge
        aria-hidden="true"
        className={`ml-1.5 inline-flex items-center rounded-full px-[7px] py-0.5 text-3xs font-bold leading-none ${
          active ? "bg-sand text-forest" : "bg-clay-wash text-clay-deep"
        }`}
      >
        {count}
      </span>
      <span className="sr-only">{t("openArbitrations", { count })}</span>
    </>
  );
}

const navItemClass = (active: boolean): string =>
  `flex items-center whitespace-nowrap rounded-full px-[15px] py-[9px] text-row transition-colors duration-120 ${
    active
      ? "bg-forest font-semibold text-page"
      : "font-medium text-ink-secondary hover:bg-inset hover:text-ink-body"
  }`;

/**
 * Aufklappmenü.
 *
 * Es trägt ZWEI Gruppen, und die zweite ist der Grund für den Aufbau:
 *
 *   `secondary` – immer im Menü (Werkzeuge, Verwaltung, Datenschutz).
 *   `primary`   – nur UNTERHALB von lg, wo die Zeile sie nicht mehr
 *                 nebeneinander trägt (Handoff § Responsive).
 *
 * Die Alternative wäre, die ganze Leiste zweimal zu rendern, einmal für breit
 * und einmal für schmal, und je eine per CSS auszublenden. Das ergäbe zwei
 * `<nav>`-Bereiche und zwei Menüknöpfe im Dokument – für einen Screenreader
 * eine doppelte Navigation, denn er richtet sich nicht nach `display: none`
 * aus einer Medienabfrage, die der Browser gar nicht auf ihn anwendet.
 * Deshalb eine Leiste, ein Menü, und nur die EINTRÄGE schalten um.
 */
function MoreMenu({
  primary,
  secondary,
  pathname,
}: {
  primary: NavItem[];
  secondary: NavItem[];
  pathname: string;
}) {
  const tn = useTranslations("nav");
  const [open, setOpen] = useState(false);
  const container = useRef<HTMLDivElement>(null);

  // Enthält das Menü die aktuelle Seite? Dann wird der Auslöser hervorgehoben,
  // sonst verlöre man beim Aufklappen die Ortsangabe. Nur die zweitrangigen
  // zählen: die erstrangigen sind oberhalb von lg als Pastille zu sehen.
  const containsActive = secondary.some((item) => item.href === pathname);

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

  if (primary.length === 0 && secondary.length === 0) return null;

  const renderItem = (item: NavItem, extra = ""): ReactNode => {
    const active = pathname === item.href;
    return (
      <Link
        key={item.href}
        href={item.href}
        role="menuitem"
        className={`block whitespace-nowrap px-4 py-2.5 text-row transition-colors duration-120 ${
          active ? "bg-inset font-semibold text-ink-primary" : "font-medium text-ink-secondary hover:bg-surface"
        } ${extra}`}
      >
        {tn(item.key)}
      </Link>
    );
  };

  return (
    <div ref={container} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
        // Ohne zweitrangige Punkte hat der Knopf oberhalb von lg keinen Inhalt
        // mehr: dort stehen die erstrangigen als Pastillen in der Zeile.
        className={`${navItemClass(containsActive)} gap-1 ${secondary.length === 0 ? "lg:hidden" : ""}`}
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
          className="absolute right-0 z-20 mt-2 min-w-48 rounded-card-inner border border-soft bg-app py-2 shadow-app"
        >
          {/* Erstrangige nur im schmalen Fenster, mit Trennlinie darunter,
              solange auch zweitrangige folgen. */}
          {primary.map((item) => renderItem(item, "lg:hidden"))}
          {primary.length > 0 && secondary.length > 0 ? (
            <hr className="my-2 border-hairline lg:hidden" />
          ) : null}
          {secondary.map((item) => renderItem(item))}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Zahl der Fachkräfte, deren Position gerade eingeht.
 *
 * Auf dem Planungsarbeitsplatz die wichtigste Randbedingung überhaupt: wer
 * einen Entwurf umbaut, muss wissen, wie viele Touren bereits laufen. Ohne
 * diese Angabe wäre nicht zu erkennen, ob man an einem Plan arbeitet oder in
 * einen laufenden Betrieb eingreift.
 */
function GpsIndicator() {
  const t = useTranslations("planning");
  const format = useFormatter();

  return (
    <span className="hidden items-center gap-2 whitespace-nowrap rounded-full border border-border-default bg-inset px-[15px] py-[9px] text-label text-ink-secondary md:inline-flex">
      <span aria-hidden="true" className="h-[7px] w-[7px] rounded-full bg-sage" />
      {t("gps", { count: format.number(GPS_STATUS.onTour) })}
    </span>
  );
}

/** Namensblock rechts in der Kopfzeile. */
function UserBlock({ email, role }: { email: string; role: UserRole }) {
  const tr = useTranslations("roles");

  return (
    <div className="flex shrink-0 items-center gap-[11px] rounded-full border border-border-default bg-inset py-[5px] pl-[5px] pr-3.5">
      <span
        aria-hidden="true"
        className="flex h-8 w-8 items-center justify-center rounded-full bg-forest text-micro font-semibold text-[#F1EEE5]"
      >
        {initialsFromEmail(email)}
      </span>
      <span className="hidden min-w-0 leading-tight sm:block">
        <span className="block truncate text-label font-semibold">{displayNameFromEmail(email)}</span>
        {/*
          Die Rolle im Klartext, und NICHT mehr die Organisations-UUID: sie
          stand vorher hier, sagte niemandem etwas und war die einzige Stelle,
          an der eine interne Kennung in der Oberfläche auftauchte.
        */}
        <span className="block truncate text-3xs text-ink-muted">{tr(role)}</span>
      </span>
    </div>
  );
}

/**
 * Kopfzeile der Plattform-Verwaltung.
 *
 * Dunkel, und das ist kein Geschmack, sondern ein GELÄNDER. Unter /admin
 * stehen Abrechnungsdaten über alle Kunden hinweg; eine Organisationsansicht
 * zeigt Patientendaten eines einzigen Kunden. Die beiden zu verwechseln wäre
 * teuer, und der Unterschied darf nicht davon abhängen, ob jemand die Adresse
 * liest. Zwei Sekunden Blick auf die Farbe genügen.
 *
 * Ohne Navigationspunkte: der Super-Admin hat genau einen Bereich, und
 * innerhalb davon führt die Reiterleiste der Seite. Ein Menü mit einem
 * einzigen Eintrag wäre Zierde.
 */
function PlatformHeader({ onLogout }: { onLogout: () => void }) {
  const tc = useTranslations("common");
  const tn = useTranslations("nav");

  return (
    <header className="flex flex-wrap items-center gap-5 bg-forest px-8 py-[18px]">
      <span className="flex flex-none items-center gap-2.5">
        <BrandMark size={22} variant="dark" />
        <span className="font-serif text-[21px] font-normal leading-none text-on-forest-primary">
          {tc("appName")}
        </span>
      </span>

      <span className="rounded-full bg-sand px-[13px] py-1.5 text-pill font-bold uppercase tracking-[.14em] text-forest-deep">
        {tn("admin")}
      </span>

      <div className="ml-auto flex shrink-0 items-center gap-3.5">
        <LocaleSwitcher variant="dark" />
        <button
          type="button"
          onClick={onLogout}
          className="whitespace-nowrap rounded-full px-2 py-1.5 text-label font-medium text-on-forest-secondary transition-colors duration-120 hover:text-on-forest-primary"
        >
          {tc("logout")}
        </button>
      </div>
    </header>
  );
}

/** Rahmen für angemeldete Seiten: Kopfzeile mit Navigation + Abmelden. */
export function AppShell({ children }: { children: ReactNode }) {
  const tc = useTranslations("common");
  const tn = useTranslations("nav");
  const { user, logout } = useAuth();
  const pathname = usePathname();

  const { primary, secondary } = navigationFor(user?.role);
  // An der ROLLE festgemacht und nicht am Pfad: der Super-Admin kommt
  // ohnehin nirgendwo anders hin (SuperAdminScope leitet zurück), und eine
  // Rolle lässt sich nicht durch eine falsch geratene Adresse umgehen.
  const platform = user?.role === "SUPER_ADMIN";

  if (platform) {
    return (
      <div className="min-h-screen bg-page px-4 py-6 sm:px-6 lg:px-8">
        <div className="mx-auto min-h-[900px] max-w-[1240px] overflow-hidden rounded-app border border-border-default bg-app shadow-app">
          <PlatformHeader onLogout={() => void logout()} />
          <main className="px-8 pb-12 pt-9">{children}</main>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-page px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1240px] overflow-hidden rounded-app border border-border-default bg-app shadow-app">
        <header className="flex items-center gap-[30px] border-b border-neutral-divider px-8 py-[18px]">
          <Link href="/dashboard" className="flex flex-none items-center gap-2.5">
            <BrandMark size={22} />
            <span className="font-serif text-[21px] font-normal leading-none text-ink-primary">
              {tc("appName")}
            </span>
          </Link>

          <nav aria-label={tn("primary")} className="flex min-w-0 items-center gap-[3px]">
            {/* Oberhalb von lg als Pastillen, darunter im Menü (siehe MoreMenu). */}
            {primary.map((item) => {
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`hidden lg:flex ${navItemClass(active)}`}
                >
                  {tn(item.key)}
                  {item.badge ? <NavBadge count={item.badge} active={active} /> : null}
                </Link>
              );
            })}
            <MoreMenu primary={primary} secondary={secondary} pathname={pathname} />
          </nav>

          <div className="ml-auto flex shrink-0 items-center gap-3.5">
            {/*
              GPS-Anzeige, nur auf dem Planungsarbeitsplatz (Handoff § 2).
              Der Handoff formuliert sie dort als ERSATZ für den
              Sprachumschalter; das wäre allerdings ein Rückschritt – auf
              genau diesem Bildschirm liesse sich die Sprache dann nicht mehr
              wechseln, und § Overview hält ausdrücklich fest, dass der
              Umschalter im Chrome erhalten bleibt. Also daneben, nicht statt.
            */}
            {pathname === "/planung" ? <GpsIndicator /> : null}
            <LocaleSwitcher />
            {user ? <UserBlock email={user.email} role={user.role} /> : null}
            <button
              type="button"
              onClick={() => void logout()}
              className="whitespace-nowrap rounded-full px-2 py-1.5 text-label font-medium text-ink-muted transition-colors duration-120 hover:text-ink-body"
            >
              {tc("logout")}
            </button>
          </div>
        </header>

        <main className="px-8 pb-11 pt-9">{children}</main>
      </div>
    </div>
  );
}
