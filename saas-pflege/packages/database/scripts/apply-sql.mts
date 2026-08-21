/**
 * Applique un fichier de prisma/sql/ sur la base pointée par DATABASE_URL.
 *
 *     pnpm --filter @len-len/database apply:sql prisma/sql/2026-08-20-....sql
 *
 * Pourquoi ce script existe : ces migrations sont écrites à la main parce que
 * le moteur de diff de Prisma est peu fiable à travers le pooler Supabase, et
 * `prisma db execute` reste bloqué jusqu'au timeout sur ce même pooler (voir la
 * note en tête de 2026-07-04-add-pointage-gps.sql). Restait la manœuvre
 * décrite là-bas : ouvrir le fichier, retirer les commentaires à la main,
 * coller dans un script tsx. Refaite à chaque migration, sans trace, elle finit
 * par diverger d'une base à l'autre — ce que personne ne remarque, le CI ne
 * jouant aucune migration.
 *
 * Le découpage sur « ; » suppose des instructions simples : pas de fonction
 * PL/pgSQL ni de chaîne contenant un point-virgule. C'est le cas de toutes les
 * migrations de ce dossier (ALTER TABLE, CREATE INDEX). Une migration plus
 * riche demanderait psql plutôt qu'un aménagement de ce script.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PrismaClient } from "@prisma/client";

const file = process.argv[2];
if (!file) {
  console.error("Usage: apply:sql <chemin/vers/migration.sql>");
  process.exit(1);
}

const path = resolve(process.cwd(), file);
const raw = readFileSync(path, "utf8");

/** Retire les commentaires « -- » et découpe en instructions. */
function statements(sql: string): string[] {
  return sql
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n")
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const parts = statements(raw);
  if (parts.length === 0) {
    console.error(`Aucune instruction dans ${file} (fichier vide ou tout en commentaires).`);
    process.exit(1);
  }

  // Masque la cible : la sortie de ce script finit dans des captures d'écran.
  const target = (process.env.DATABASE_URL ?? "").replace(/:[^:@/]*@/, ":***@");
  console.log(`Base   : ${target || "(DATABASE_URL absente)"}`);
  console.log(`Fichier: ${file}`);
  console.log(`${parts.length} instruction(s)\n`);

  for (const [i, statement] of parts.entries()) {
    const preview = statement.replace(/\s+/g, " ").slice(0, 90);
    process.stdout.write(`  [${i + 1}/${parts.length}] ${preview}… `);
    // Pas de transaction englobante : les migrations de ce dossier sont
    // idempotentes (IF NOT EXISTS), et un CREATE INDEX peut être long. Une
    // reprise après échec consiste à relancer le fichier.
    await prisma.$executeRawUnsafe(statement);
    console.log("ok");
  }

  console.log("\nTerminé. Vérifier ensuite information_schema (voir le pied du fichier SQL).");
}

main()
  .catch((err) => {
    console.error("\nÉchec :", err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
