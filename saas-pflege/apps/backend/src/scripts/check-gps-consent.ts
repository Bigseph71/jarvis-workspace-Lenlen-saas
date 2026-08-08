/**
 * Contrôle : état des einwilligungen GPS et des positions collectées.
 *
 * Sert à vérifier, après un test depuis l'app mobile, que la chaîne complète a
 * fonctionné : l'écran de consentement a bien écrit une ligne, et le tracking
 * n'a écrit des positions QUE pour les fachkräfte couvertes.
 *
 * Le script est en LECTURE SEULE. Il n'écrit rien, ne supprime rien, et peut
 * donc être lancé sans précaution contre la base de production.
 *
 * Usage (depuis apps/backend) :
 *
 *   pnpm check:gps-consent
 *   pnpm check:gps-consent -- --org=<uuid>     # limite à une organisation
 *   pnpm check:gps-consent -- --hours=2        # fenêtre récente (défaut : 24)
 *
 * Le contrôle qui compte est le dernier : une position dont la fachkraft n'a
 * aucune einwilligung en cours est une collecte sans base légale. La liste
 * doit rester vide ; si elle ne l'est pas, c'est que l'application du
 * consentement (tracking.service) a été contournée quelque part.
 */
import "dotenv/config";
import { prisma } from "@len-len/database";
import { GPS_POLICY_VERSION } from "../modules/consent/consent.policy.js";

interface Options {
  organizationId?: string;
  hours: number;
}

function parseArgs(argv: string[]): Options {
  const org = argv.find((a) => a.startsWith("--org="))?.slice("--org=".length);
  const hoursRaw = argv.find((a) => a.startsWith("--hours="))?.slice("--hours=".length);
  const hours = hoursRaw ? Number(hoursRaw) : 24;
  if (!Number.isFinite(hours) || hours <= 0) {
    console.error("--hours doit être un nombre positif.");
    process.exit(1);
  }
  return { organizationId: org, hours };
}

function line(): void {
  console.log("─".repeat(78));
}

function fmt(date: Date | null): string {
  return date ? date.toISOString().replace("T", " ").slice(0, 19) : "—";
}

async function main(): Promise<void> {
  const { organizationId, hours } = parseArgs(process.argv.slice(2));
  const since = new Date(Date.now() - hours * 3_600_000);
  const orgFilter = organizationId ? { organizationId } : {};

  console.log(`Base    : ${new URL(process.env.DATABASE_URL ?? "postgres://?").hostname}`);
  console.log(`Fenêtre : depuis ${fmt(since)} (${hours} h)`);
  console.log(`Version de texte en vigueur : ${GPS_POLICY_VERSION}`);
  line();

  // ── 1. Einwilligungen ───────────────────────────────────────────────────
  const consents = await prisma.gpsConsent.findMany({
    where: orgFilter,
    orderBy: { grantedAt: "desc" },
    include: {
      caregiver: { select: { firstName: true, lastName: true } },
      organization: { select: { name: true } },
    },
  });

  console.log(`EINWILLIGUNGEN (${consents.length} au total)`);
  if (consents.length === 0) {
    console.log("  aucune. Si un test vient d'avoir lieu, l'écran n'a rien écrit.");
  }
  for (const c of consents) {
    // Une einwilligung ne couvre que le texte qui lui a été présenté : une
    // version périmée ne protège plus rien, même sans révocation.
    const outdated = c.policyVersion !== GPS_POLICY_VERSION;
    const state = c.revokedAt ? "RÉVOQUÉE" : outdated ? "PÉRIMÉE " : "ACTIVE  ";
    const who = `${c.caregiver.firstName} ${c.caregiver.lastName}`;
    console.log(
      `  ${state} ${who.padEnd(28)} v${c.policyVersion} ${c.locale}` +
        `  accordée ${fmt(c.grantedAt)}` +
        (c.revokedAt ? `  révoquée ${fmt(c.revokedAt)}` : "") +
        `  [${c.organization.name}]`,
    );
  }
  line();

  // ── 2. Positions récentes ───────────────────────────────────────────────
  const positions = await prisma.gpsPosition.findMany({
    where: { ...orgFilter, recordedAt: { gte: since } },
    orderBy: { recordedAt: "desc" },
    take: 20,
    include: { caregiver: { select: { firstName: true, lastName: true } } },
  });
  const totalPositions = await prisma.gpsPosition.count({ where: orgFilter });

  console.log(`POSITIONS — ${positions.length} dans la fenêtre, ${totalPositions} au total`);
  for (const p of positions) {
    const who = `${p.caregiver.firstName} ${p.caregiver.lastName}`;
    console.log(
      `  ${fmt(p.recordedAt)}  ${who.padEnd(28)}` +
        `  ${Number(p.latitude).toFixed(5)}, ${Number(p.longitude).toFixed(5)}` +
        (p.geofenceBreach ? "  HORS ZONE" : ""),
    );
  }
  line();

  // ── 3. Traces d'audit ───────────────────────────────────────────────────
  const audit = await prisma.auditLog.findMany({
    where: { ...orgFilter, entityType: "gps_consent", createdAt: { gte: since } },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true, userId: true, metadata: true },
  });

  console.log(`AUDIT (einwilligungen, fenêtre) — ${audit.length} entrée(s)`);
  for (const a of audit) {
    const meta = a.metadata as { event?: string };
    console.log(`  ${fmt(a.createdAt)}  ${meta.event ?? "?"}  par ${a.userId ?? "(compte supprimé)"}`);
  }
  line();

  // ── 4. Le contrôle décisif ──────────────────────────────────────────────
  // Positions dont la fachkraft n'a AUCUNE einwilligung en cours pour la
  // version en vigueur. Cette liste doit être vide.
  const covered = new Set(
    consents.filter((c) => !c.revokedAt && c.policyVersion === GPS_POLICY_VERSION).map((c) => c.caregiverId),
  );

  const trackedCaregivers = await prisma.gpsPosition.groupBy({
    by: ["caregiverId", "organizationId"],
    where: orgFilter,
    _count: { _all: true },
    _max: { recordedAt: true },
  });

  const uncovered = trackedCaregivers.filter((g) => !covered.has(g.caregiverId));

  if (uncovered.length === 0) {
    console.log("CONTRÔLE : OK — aucune position sans einwilligung en cours.");
  } else {
    console.log("CONTRÔLE : ANOMALIE — positions sans einwilligung en cours :");
    for (const g of uncovered) {
      const cg = await prisma.caregiver.findUnique({
        where: { id: g.caregiverId },
        select: { firstName: true, lastName: true, anonymizedAt: true },
      });
      const who = cg ? `${cg.firstName} ${cg.lastName}` : g.caregiverId;
      console.log(
        `  ${who.padEnd(28)} ${g._count._all} position(s), dernière ${fmt(g._max.recordedAt)}`,
      );
    }
    // Une révocation n'efface pas le passé (art. 7 §3) : des positions
    // antérieures à une révocation sont normales et ne sont pas un défaut.
    console.log(
      "\n  Note : des positions antérieures à une révocation sont licites et attendues.\n" +
        "  L'anomalie n'en est une que si elles sont POSTÉRIEURES à la révocation,\n" +
        "  ou si la fachkraft n'a jamais donné d'einwilligung.",
    );
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
