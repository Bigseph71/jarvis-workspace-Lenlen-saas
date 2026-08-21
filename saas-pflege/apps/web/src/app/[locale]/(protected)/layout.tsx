import type { ReactNode } from "react";
import { AuthGuard } from "@/components/auth-guard";
import { AppShell } from "@/components/app-shell";
import { SuperAdminScope } from "@/components/super-admin-scope";

/** Alle Routen unter dieser Gruppe erfordern eine Anmeldung. */
export default function ProtectedLayout({ children }: { children: ReactNode }) {
  return (
    <AuthGuard>
      {/* Innerhalb der Shell: die Kopfzeile bleibt während der Umleitung
          stehen, statt dass die Seite kurz leer aufblitzt. */}
      <AppShell>
        <SuperAdminScope>{children}</SuperAdminScope>
      </AppShell>
    </AuthGuard>
  );
}
