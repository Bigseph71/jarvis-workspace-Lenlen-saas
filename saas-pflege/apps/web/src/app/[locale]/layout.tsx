import { NextIntlClientProvider } from "next-intl";
import { getMessages } from "next-intl/server";
import { notFound } from "next/navigation";
import { Newsreader, Hanken_Grotesk } from "next/font/google";
import { routing } from "../../i18n/routing";
import { AuthProvider } from "@/lib/auth/auth-context";
import "./globals.css";

/**
 * Schriften der Überarbeitung (Handoff § Typographie).
 *
 * Über `next/font/google` und NICHT als <link> auf fonts.googleapis.com: Next
 * lädt die Dateien beim Build herunter und liefert sie von unserer eigenen
 * Domain aus. Der Browser der Nutzerin ruft Google nie auf, es wird also keine
 * IP-Adresse dorthin übertragen – genau die DSGVO-Auflage, die der Handoff für
 * die Produktion vorsieht. Der Umweg über das CDN wäre nicht nur später zu
 * ersetzen, er wäre auch heute schon der schlechtere Weg.
 *
 * `display: swap` zeigt den Text sofort in der Ersatzschrift: eine Kopfzeile,
 * die eine halbe Sekunde leer bleibt, wirkt wie ein Ladefehler.
 */
const newsreader = Newsreader({
  subsets: ["latin", "latin-ext"], // latin-ext trägt die deutschen Umlaute mit
  weight: ["300", "400", "500"],
  style: ["normal", "italic"],
  variable: "--font-newsreader",
  display: "swap",
});

const hanken = Hanken_Grotesk({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-hanken",
  display: "swap",
});

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!routing.locales.includes(locale as (typeof routing.locales)[number])) {
    notFound();
  }
  const messages = await getMessages();

  return (
    <html lang={locale} className={`${newsreader.variable} ${hanken.variable}`}>
      <body className="bg-page font-sans text-ink-primary antialiased">
        <NextIntlClientProvider messages={messages}>
          <AuthProvider>{children}</AuthProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
