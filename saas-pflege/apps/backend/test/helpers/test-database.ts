/**
 * Garde-fou des tests qui touchent une vraie base.
 *
 * Ces tests créent des tenants et les suppriment ensuite. Pointés sur la base
 * de production, ils y écriraient et y supprimeraient pour de bon. Le seul
 * paramétrage est une variable d'environnement, donc l'erreur tient à une
 * ligne dans un `.env` : la garde refuse par défaut tout hôte qui n'est pas
 * local.
 */

/** Hôtes considérés comme une base de test (dev local, service CI, Docker). */
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]", "postgres", "db"]);

/**
 * Vérifie que `url` désigne une base de test. Lève sinon.
 *
 * `ALLOW_REMOTE_DB_TESTS=1` lève la restriction, pour le cas légitime d'une
 * base de test distante. C'est volontairement un geste explicite : on ne peut
 * pas y arriver par distraction.
 */
export function assertLocalTestDatabase(url: string | undefined): void {
  if (!url) {
    throw new Error(
      "DATABASE_URL manquante. Renseigner TEST_DATABASE_URL vers une base de test migrée.",
    );
  }

  let hostname: string;
  try {
    hostname = new URL(url).hostname;
  } catch {
    throw new Error(`DATABASE_URL n'est pas une URL exploitable : ${url}`);
  }

  if (process.env.ALLOW_REMOTE_DB_TESTS === "1") return;

  if (!LOCAL_HOSTS.has(hostname)) {
    throw new Error(
      `Les tests DB créent puis suppriment des tenants : ils ne tournent que contre une base locale. ` +
        `DATABASE_URL pointe sur "${hostname}". Renseigner TEST_DATABASE_URL vers une base de test, ` +
        `ou ALLOW_REMOTE_DB_TESTS=1 si c'est réellement voulu.`,
    );
  }
}
