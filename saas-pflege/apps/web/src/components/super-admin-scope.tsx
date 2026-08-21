"use client";

import { useEffect, type ReactNode } from "react";
import { usePathname, useRouter } from "@/i18n/navigation";
import { useAuth } from "@/lib/auth/auth-context";

/** Der einzige Bereich, in dem sich der Super-Admin bewegt. */
const ADMIN_PREFIX = "/admin";

/**
 * Hält den Super-Admin in der Plattform-Verwaltung.
 *
 * Ruft er eine Tenant-Adresse auf (/patients, /visits, /chat …), landet er auf
 * /admin. Nicht als Sicherheitsmassnahme – die leistet das Backend, das ihm
 * seit dieser Änderung auf keinem dieser Endpunkte mehr antwortet – sondern
 * damit er nicht auf eine Seite läuft, die ihm nur Fehlermeldungen zeigt.
 *
 * Ohne diese Weiche bliebe der Unterschied unsichtbar: die Navigation bietet
 * ihm die Module ohnehin nicht mehr an, ein Lesezeichen oder ein Link aus einer
 * E-Mail führt aber weiterhin dorthin.
 */
export function SuperAdminScope({ children }: { children: ReactNode }) {
  const { user, status } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  // usePathname von next-intl liefert den Pfad OHNE Sprachpräfix: "/patients",
  // nicht "/de/patients".
  const outsideAdmin =
    status === "authenticated" &&
    user?.role === "SUPER_ADMIN" &&
    !pathname.startsWith(ADMIN_PREFIX);

  useEffect(() => {
    if (outsideAdmin) router.replace(ADMIN_PREFIX);
  }, [outsideAdmin, router]);

  // Während der Umleitung nichts rendern: sonst blitzt eine Tenant-Seite auf,
  // deren Anfragen ohnehin mit 403 zurückkommen.
  if (outsideAdmin) return null;

  return <>{children}</>;
}
