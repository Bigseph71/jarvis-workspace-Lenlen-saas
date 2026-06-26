import { useTranslations } from "next-intl";

export default function HomePage() {
  const t = useTranslations("home");
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8">
      <h1 className="text-3xl font-bold">{t("title")}</h1>
      <p className="text-gray-600">{t("subtitle")}</p>
    </main>
  );
}
