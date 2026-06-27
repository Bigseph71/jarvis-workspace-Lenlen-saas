import type { ReactNode } from "react";
import { AuthGuard } from "@/components/auth-guard";

/** Alle Routen unter dieser Gruppe erfordern eine Anmeldung. */
export default function ProtectedLayout({ children }: { children: ReactNode }) {
  return <AuthGuard>{children}</AuthGuard>;
}
