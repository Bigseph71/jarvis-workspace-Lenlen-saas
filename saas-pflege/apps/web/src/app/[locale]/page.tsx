import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { LocaleSwitcher } from "@/components/locale-switcher";

/**
 * Einstiegsseite. Bislang zeigte sie nur Titel und Untertitel und war damit
 * eine Sackgasse: wer die Domain aufrief, musste /de/login von Hand tippen.
 *
 * Sie führt jetzt an die beiden einzigen sinnvollen Stellen – Anmeldung für
 * Bestandskunden, Registrierung für Interessenten – und trägt den
 * Sprachumschalter, der sonst nirgends erreichbar war.
 */
export default function HomePage() {
  const t = useTranslations("home");

  return (
    <main className="flex min-h-screen flex-col bg-gray-50">
      <header className="flex justify-end p-4">
        <LocaleSwitcher />
      </header>

      <div className="flex flex-1 items-center justify-center px-4 pb-16">
        <div className="w-full max-w-md text-center">
          <h1 className="text-3xl font-bold text-gray-900">{t("title")}</h1>
          <p className="mt-2 text-gray-600">{t("subtitle")}</p>

          <div className="mt-8 flex flex-col gap-3">
            <Link
              href="/login"
              className="w-full rounded-md bg-gray-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-gray-700"
            >
              {t("login")}
            </Link>
            <Link
              href="/register"
              className="w-full rounded-md border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-100"
            >
              {t("register")}
            </Link>
          </div>

          <p className="mt-6 text-xs text-gray-500">{t("trialHint")}</p>
        </div>
      </div>
    </main>
  );
}
