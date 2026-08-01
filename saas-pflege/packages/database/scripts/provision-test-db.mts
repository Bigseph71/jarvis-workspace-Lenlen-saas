/**
 * Prépare une base de test : schéma complet + policies RLS.
 *
 *   pnpm --filter @len-len/database provision:test
 *
 * Lit TEST_DATABASE_URL (environnement ou apps/backend/.env). Le schéma est
 * poussé avec `prisma db push` plutôt que `migrate deploy` : ce dépôt n'a pas
 * de dossier migrations, schema.prisma est la référence. Les policies de
 * prisma/rls.sql sont appliquées ensuite, sinon l'isolation multi-tenant ne
 * serait pas testée du tout.
 *
 * Refuse de tourner si TEST_DATABASE_URL vaut la DATABASE_URL applicative :
 * `db push` aligne le schéma sur le fichier et peut détruire des données.
 */
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";

// ── Environnement ─────────────────────────────────────────────────────────

const ENV_FILE = new URL("../../../apps/backend/.env", import.meta.url);
const fromFile = new Map<string, string>();
try {
  for (const line of readFileSync(ENV_FILE, "utf8").split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
    if (m) fromFile.set(m[1]!, m[2]!.trim().replace(/^["']|["']$/g, ""));
  }
} catch {
  // Pas de .env : on se contente de l'environnement du processus.
}

const testUrl = process.env.TEST_DATABASE_URL ?? fromFile.get("TEST_DATABASE_URL");
const appUrl = process.env.DATABASE_URL ?? fromFile.get("DATABASE_URL");

if (!testUrl) {
  console.error(
    "TEST_DATABASE_URL manquante.\n" +
      "La renseigner dans apps/backend/.env ou dans l'environnement, vers une base DÉDIÉE aux tests.",
  );
  process.exit(1);
}

if (appUrl && testUrl === appUrl) {
  console.error(
    "TEST_DATABASE_URL est identique à DATABASE_URL.\n" +
      "`prisma db push` aligne le schéma sur schema.prisma et peut détruire des données : refus.",
  );
  process.exit(1);
}

const host = new URL(testUrl).hostname;
console.log(`Base de test : ${host}\n`);

// ── 1. Schéma ─────────────────────────────────────────────────────────────

console.log("[1/2] prisma db push …");
const push = spawnSync(
  "npx",
  ["prisma", "db", "push", "--skip-generate"],
  {
    cwd: fileURLToPath(new URL("..", import.meta.url)),
    env: { ...process.env, DATABASE_URL: testUrl },
    stdio: "inherit",
    shell: process.platform === "win32",
  },
);
if (push.status !== 0) {
  console.error("\n`prisma db push` a échoué, RLS non appliquée.");
  process.exit(push.status ?? 1);
}

// ── 2. Policies RLS ───────────────────────────────────────────────────────

/**
 * Découpe sur les `;` de premier niveau en respectant chaînes et blocs
 * dollar-quotés : rls.sql est presque entièrement un DO $$ … $$ dont les `;`
 * internes ne terminent aucune instruction.
 */
function splitStatements(sql: string): string[] {
  const statements: string[] = [];
  let current = "";
  let i = 0;
  let dollarTag: string | null = null;
  let quote: '"' | "'" | null = null;

  while (i < sql.length) {
    const rest = sql.slice(i);

    if (dollarTag) {
      if (rest.startsWith(dollarTag)) {
        current += dollarTag;
        i += dollarTag.length;
        dollarTag = null;
        continue;
      }
    } else if (quote) {
      if (sql[i] === quote) quote = null;
    } else {
      const open = /^\$[A-Za-z_]*\$/.exec(rest);
      if (open) {
        dollarTag = open[0];
        current += dollarTag;
        i += dollarTag.length;
        continue;
      }
      if (sql[i] === '"' || sql[i] === "'") {
        quote = sql[i] as '"' | "'";
      } else if (sql.startsWith("--", i)) {
        const nl = sql.indexOf("\n", i);
        i = nl === -1 ? sql.length : nl + 1;
        continue;
      } else if (sql[i] === ";") {
        const trimmed = current.trim();
        if (trimmed) statements.push(trimmed);
        current = "";
        i += 1;
        continue;
      }
    }

    current += sql[i];
    i += 1;
  }

  const tail = current.trim();
  if (tail) statements.push(tail);
  return statements;
}

console.log("\n[2/2] policies RLS …");
const prisma = new PrismaClient({ datasources: { db: { url: testUrl } }, log: ["error"] });
const rls = readFileSync(new URL("../prisma/rls.sql", import.meta.url), "utf8");

for (const statement of splitStatements(rls)) {
  await prisma.$executeRawUnsafe(statement);
}

const [{ tables }] = await prisma.$queryRawUnsafe<{ tables: bigint }[]>(
  `SELECT count(*) AS tables FROM information_schema.tables WHERE table_schema = 'public'`,
);
const [{ policies }] = await prisma.$queryRawUnsafe<{ policies: bigint }[]>(
  `SELECT count(*) AS policies FROM pg_policies WHERE schemaname = 'public'`,
);

console.log(`\nPrêt : ${tables} table(s), ${policies} policy(ies) RLS.`);
console.log("Lancer les tests :");
console.log("  RUN_DB_TESTS=1 ALLOW_REMOTE_DB_TESTS=1 pnpm --filter @len-len/backend test");

await prisma.$disconnect();
