"use client";

import { useEffect, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { useAuth } from "@/lib/auth/auth-context";
import { useRouter } from "@/i18n/navigation";

/**
 * Schützt einen Bereich: leitet nicht angemeldete Nutzer auf /login um und
 * zeigt währenddessen einen Ladezustand. Clientseitig (MVP); serverseitige
 * Absicherung erfolgt ohnehin im Backend (JWT + RLS).
 */
export function AuthGuard({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const router = useRouter();
  const t = useTranslations("common");

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/login");
    }
  }, [status, router]);

  if (status !== "authenticated") {
    return (
      <div className="flex min-h-screen items-center justify-center text-gray-500">{t("loading")}</div>
    );
  }

  return <>{children}</>;
}
