import { defineRouting } from "next-intl/routing";

// DE = Standard, plus EN / FR. URL-Routing /de /en /fr.
export const routing = defineRouting({
  locales: ["de", "en", "fr"],
  defaultLocale: "de",
});
