import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";

export default createMiddleware(routing);

export const config = {
  // Alle Pfade ausser API, Next-Internals, /health und statischen Dateien.
  //
  // `health$` steht mit in der Liste, weil der Health-Check unter genau
  // `/health` erreichbar sein muss. Ohne die Ausnahme leitet next-intl ihn
  // auf `/de/health` um - und ein Ueberwachungssystem, das einer
  // Weiterleitung nicht folgt, sieht dann eine 307 statt einer 200 und
  // meldet den Dienst als ausgefallen.
  //
  // Das `$` ist wesentlich: ohne es wirkt der Eintrag als Praefix, und
  // eine spaetere Seite /healthcare fiele stillschweigend mit aus dem
  // Sprach-Routing.
  matcher: ["/((?!api|_next|_vercel|health$|.*\\..*).*)"],
};
