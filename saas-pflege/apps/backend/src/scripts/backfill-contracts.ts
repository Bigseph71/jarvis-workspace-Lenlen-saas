/**
 * Rattrapage : crée le contrat initial des fachkräfte qui n'en ont aucun.
 *
 * Les fachkräfte créées avant le module HR portent des champs de contrat
 * (contract_type, weekly_hours, work_days, max_patients) sans ligne
 * correspondante dans `contracts`. Ces champs ne sont pourtant qu'une copie du
 * contrat en vigueur : sans source, la copie n'a plus d'historique et le
 * module Vertrag daterait le premier contrat du jour de la modification au
 * lieu de l'entrée dans le système.
 *
 * Le script reconstruit ce contrat manquant à partir de la copie, en le datant
 * de la création de la fachkraft (`created_at`), sauf date imposée.
 *
 * Usage (depuis apps/backend) :
 *
 *   pnpm backfill:contracts                    # dry-run, n'écrit rien
 *   pnpm backfill:contracts -- --apply         # applique
 *   pnpm backfill:contracts -- --apply --org=<uuid>
 *   pnpm backfill:contracts -- --apply --valid-from=2026-01-01
 *   pnpm backfill:contracts -- --apply --include-inactive
 *
 * Idempotent : une fachkraft qui a déjà au moins un contrat est ignorée, le
 * script peut donc être rejoué sans risque.
 */

import "dotenv/config";
import { prisma, withTenant, type Prisma } from "@len-len/database";
import { applyContractChange } from "../modules/hr/hr.service.js";
import { writeAudit } from "../lib/audit.js";
import { AuditAction } from "@len-len/database";
import type { TenantContext } from "../lib/context.js";
import type { EmitFn } from "../lib/domain-events.js";

// ── Options ───────────────────────────────────────────────────────────────

interface Options {
  apply: boolean;
  organizationId?: string;
  validFrom?: Date;
  includeInactive: boolean;
}

function parseArgs(argv: string[]): Options {
  const options: Options = { apply: false, includeInactive: false };

  for (const arg of argv) {
    if (arg === "--apply") options.apply = true;
    else if (arg === "--include-inactive") options.includeInactive = true;
    else if (arg.startsWith("--org=")) options.organizationId = arg.slice("--org=".length);
    else if (arg.startsWith("--valid-from=")) {
      const raw = arg.slice("--valid-from=".length);
      const parsed = new Date(`${raw}T00:00:00.000Z`);
      if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== raw) {
        throw new Error(`--valid-from attend une date YYYY-MM-DD valide, reçu "${raw}"`);
      }
      options.validFrom = parsed;
    } else if (arg.startsWith("--")) {
      throw new Error(`Option inconnue : ${arg}`);
    }
  }

  return options;
}

// ── Rattrapage ────────────────────────────────────────────────────────────

/** Annule la transaction d'un dry-run tout en ramenant le compte réalisé. */
class DryRunRollback extends Error {
  constructor(public readonly processed: number) {
    super("dry-run");
    this.name = "DryRunRollback";
  }
}

function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

const WEEKDAY_CODES: readonly string[] = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];

/**
 * work_days est du JSON libre. Une copie vide ou corrompue ne peut pas donner
 * un contrat valable : mieux vaut le signaler que d'écrire un contrat sans
 * jour travaillé, que la planification refuserait ensuite silencieusement.
 */
function toWeekDays(value: Prisma.JsonValue): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === "string" && WEEKDAY_CODES.includes(v));
}

interface OrgResult {
  organizationId: string;
  name: string;
  created: number;
  skipped: { caregiverId: string; name: string; reason: string }[];
}

async function backfillOrganization(
  organizationId: string,
  name: string,
  options: Options,
): Promise<OrgResult> {
  const ctx: TenantContext = { organizationId, userId: null };
  const result: OrgResult = { organizationId, name, created: 0, skipped: [] };

  const run = async (): Promise<number> =>
    withTenant(organizationId, async (tx) => {
      const caregivers = await tx.caregiver.findMany({
        where: {
          organizationId,
          ...(options.includeInactive ? {} : { isActive: true }),
          // Le filtre qui rend le script rejouable.
          contracts: { none: {} },
        },
        orderBy: { createdAt: "asc" },
      });

      let created = 0;
      // Le rattrapage ne notifie personne : il reconstruit du passé, il ne
      // décrit pas un changement. Les événements sont donc absorbés ici.
      const emit: EmitFn = () => {};

      for (const caregiver of caregivers) {
        const workDays = toWeekDays(caregiver.workDays);
        if (workDays.length === 0) {
          result.skipped.push({
            caregiverId: caregiver.id,
            name: `${caregiver.firstName} ${caregiver.lastName}`,
            reason: "aucun jour travaillé dans la copie",
          });
          continue;
        }

        await applyContractChange(
          tx,
          ctx,
          caregiver.id,
          {
            contractType: caregiver.contractType,
            weeklyHours: Number(caregiver.weeklyHours),
            workDays,
            maxPatients: caregiver.maxPatients,
            validFrom: options.validFrom ?? startOfUtcDay(caregiver.createdAt),
          },
          emit,
        );
        created += 1;
      }

      if (created > 0) {
        await writeAudit(tx, ctx, {
          action: AuditAction.CREATE,
          entityType: "hr_contract_backfill",
          metadata: {
            created,
            skipped: result.skipped.length,
            validFrom: options.validFrom?.toISOString().slice(0, 10) ?? "created_at",
          },
        });
      }

      if (!options.apply) throw new DryRunRollback(created);
      return created;
    });

  try {
    result.created = await run();
  } catch (err) {
    if (err instanceof DryRunRollback) result.created = err.processed;
    else throw err;
  }

  return result;
}

// ── Exécution ─────────────────────────────────────────────────────────────

const options = parseArgs(process.argv.slice(2));

const organizations = await prisma.organization.findMany({
  where: options.organizationId ? { id: options.organizationId } : {},
  select: { id: true, name: true },
  orderBy: { name: "asc" },
});

if (organizations.length === 0) {
  console.error("Aucune organisation trouvée.");
  process.exit(1);
}

console.log(
  options.apply
    ? `Rattrapage des contrats initiaux sur ${organizations.length} organisation(s).`
    : `DRY-RUN sur ${organizations.length} organisation(s) : rien ne sera écrit.`,
);
console.log(
  `Date d'effet : ${options.validFrom?.toISOString().slice(0, 10) ?? "création de la fachkraft"}` +
    ` | fachkräfte inactives : ${options.includeInactive ? "incluses" : "ignorées"}\n`,
);

const results: OrgResult[] = [];
for (const org of organizations) {
  results.push(await backfillOrganization(org.id, org.name, options));
}

let totalCreated = 0;
let totalSkipped = 0;
for (const r of results) {
  totalCreated += r.created;
  totalSkipped += r.skipped.length;
  if (r.created === 0 && r.skipped.length === 0) continue;

  console.log(`${r.name} (${r.organizationId})`);
  console.log(`  contrats ${options.apply ? "créés" : "à créer"} : ${r.created}`);
  for (const s of r.skipped) {
    console.log(`  ignorée : ${s.name} (${s.caregiverId}) — ${s.reason}`);
  }
}

console.log(
  `\nTotal : ${totalCreated} contrat(s) ${options.apply ? "créé(s)" : "à créer"}` +
    (totalSkipped > 0 ? `, ${totalSkipped} fachkraft/fachkräfte ignorée(s)` : ""),
);
if (!options.apply) console.log("Aucune écriture effectuée. Relancer avec --apply pour appliquer.");

await prisma.$disconnect();
