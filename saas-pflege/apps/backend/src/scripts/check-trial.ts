/**
 * Contrôle : état des abonnements et des périodes d'essai.
 *
 * Sert à vérifier, après un parcours d'inscription puis de checkout, que la
 * chaîne complète a fonctionné : l'organisation créée gelée, puis débloquée
 * par Stripe en `TRIAL` avec une échéance, et enfin le passage en `ACTIVE`.
 *
 * Le script est en LECTURE SEULE. Il n'écrit rien, ne supprime rien, et peut
 * donc être lancé sans précaution contre la base de production.
 *
 * Usage (depuis apps/backend) :
 *
 *   pnpm check:trial
 *   pnpm check:trial -- --org=<uuid>
 *
 * Le contrôle qui compte est le dernier : il signale les états incohérents,
 * c'est-à-dire ceux que la mécanique Stripe ne devrait jamais produire. Une
 * organisation en essai sans abonnement Stripe, par exemple, veut dire que le
 * statut a été posé localement et que personne ne la fera basculer en payant.
 */
import "dotenv/config";
import { prisma } from "@len-len/database";
import { trialDaysRemaining } from "../modules/billing/trial.js";
import { env } from "../config/env.js";

interface Options {
  organizationId?: string;
}

function parseArgs(argv: string[]): Options {
  return { organizationId: argv.find((a) => a.startsWith("--org="))?.slice("--org=".length) };
}

function line(): void {
  console.log("─".repeat(78));
}

function fmt(date: Date | null): string {
  return date ? date.toISOString().replace("T", " ").slice(0, 16) : "—";
}

async function main(): Promise<void> {
  const { organizationId } = parseArgs(process.argv.slice(2));
  const where = organizationId ? { id: organizationId } : {};

  console.log(`Base    : ${new URL(process.env.DATABASE_URL ?? "postgres://?").hostname}`);
  console.log(`Essai configuré : ${env.TRIAL_PERIOD_DAYS} jours (TRIAL_PERIOD_DAYS)`);
  line();

  const orgs = await prisma.organization.findMany({
    where,
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      name: true,
      createdAt: true,
      subscriptionPlan: true,
      subscriptionStatus: true,
      trialEndsAt: true,
      pastDueSince: true,
      stripeCustomerId: true,
      stripeSubscriptionId: true,
    },
  });

  console.log(`ORGANISATIONS (${orgs.length})`);
  for (const o of orgs) {
    const stripe = o.stripeSubscriptionId
      ? "abo Stripe"
      : o.stripeCustomerId
        ? "client Stripe, sans abo"
        : "aucun Stripe";
    const reste =
      o.trialEndsAt !== null ? ` · reste ${trialDaysRemaining(o.trialEndsAt)} j` : "";
    console.log(`  ${o.name}`);
    console.log(
      `    ${o.subscriptionStatus.padEnd(9)} ${o.subscriptionPlan.padEnd(10)} ${stripe}` +
        `  essai jusqu'au ${fmt(o.trialEndsAt)}${reste}`,
    );
    console.log(`    créée ${fmt(o.createdAt)}${o.pastDueSince ? `  impayé depuis ${fmt(o.pastDueSince)}` : ""}`);
  }
  line();

  // ── Derniers événements Stripe ──────────────────────────────────────────
  const events = await prisma.billingWebhookEvent.findMany({
    orderBy: { processedAt: "desc" },
    take: 12,
    select: { type: true, processedAt: true },
  });
  console.log(`ÉVÉNEMENTS STRIPE REÇUS (${events.length} derniers)`);
  if (events.length === 0) console.log("  aucun. Aucun checkout n'a encore abouti.");
  for (const e of events) console.log(`  ${fmt(e.processedAt)}  ${e.type}`);
  line();

  // ── Le contrôle décisif ─────────────────────────────────────────────────
  const problems: string[] = [];

  for (const o of orgs) {
    // Un essai est porté par Stripe : sans abo, personne ne fera basculer
    // cette organisation en payant, et rien ne l'arrêtera non plus.
    if (o.subscriptionStatus === "TRIAL" && !o.stripeSubscriptionId) {
      problems.push(`${o.name} : en TRIAL sans abonnement Stripe`);
    }
    // Symétrique : un essai sans date ne peut rien afficher ni expirer.
    if (o.subscriptionStatus === "TRIAL" && !o.trialEndsAt) {
      problems.push(`${o.name} : en TRIAL sans date d'échéance`);
    }
    // Un abo payant qui traîne encore une date d'essai fausserait l'affichage.
    if (o.subscriptionStatus === "ACTIVE" && o.trialEndsAt) {
      problems.push(`${o.name} : ACTIVE mais garde une date d'essai`);
    }
  }

  if (problems.length === 0) {
    console.log("CONTRÔLE : OK — aucun état incohérent.");
  } else {
    console.log("CONTRÔLE : ANOMALIES");
    for (const p of problems) console.log(`  ${p}`);
  }

  // Lecture des cas normaux, pour éviter de les prendre pour des défauts.
  const fresh = orgs.filter((o) => o.subscriptionStatus === "SUSPENDED" && !o.stripeCustomerId);
  const unpaid = orgs.filter((o) => o.subscriptionStatus === "SUSPENDED" && o.stripeCustomerId);
  console.log(
    `\n  Inscriptions en attente de plan (SUSPENDED sans client Stripe) : ${fresh.length}` +
      `\n  Suspensions pour impayé (SUSPENDED avec client Stripe)        : ${unpaid.length}`,
  );
  console.log(
    "\n  Note : SUSPENDED sans client Stripe est l'état NORMAL d'une\n" +
      "  inscription qui n'a pas encore choisi de plan, pas un défaut.",
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
