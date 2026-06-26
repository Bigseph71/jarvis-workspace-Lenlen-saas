import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";

export default createMiddleware(routing);

export const config = {
  // Alle Pfade außer API, Next-Internals und statischen Dateien
  matcher: ["/((?!api|_next|_vercel|.*\\..*).*)"],
};
