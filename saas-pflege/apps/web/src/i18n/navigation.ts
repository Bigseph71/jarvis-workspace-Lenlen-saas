import { createNavigation } from "next-intl/navigation";
import { routing } from "./routing";

// Locale-bewusste Navigations-Helfer (Link, redirect, useRouter ...).
// Immer diese statt next/navigation verwenden, damit das /de /en /fr-Präfix
// automatisch erhalten bleibt.
export const { Link, redirect, usePathname, useRouter, getPathname } = createNavigation(routing);
