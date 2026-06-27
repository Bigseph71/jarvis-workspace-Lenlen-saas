import type { Prisma, SubscriptionPlan } from "@len-len/database";

export interface PlanLimits {
  patients: number;
  caregivers: number;
  /** null = unbegrenzt (Enterprise-Fahrzeuge). */
  vehicles: number | null;
  ki: boolean;
}

export type LimitedResource = "patients" | "caregivers" | "vehicles";

// Quelle der Wahrheit für Plan-Limits (CLAUDE.md).
export const PLAN_LIMITS: Record<SubscriptionPlan, PlanLimits> = {
  BASIC: { patients: 100, caregivers: 10, vehicles: 5, ki: false },
  PRO: { patients: 1000, caregivers: 100, vehicles: 30, ki: true },
  ENTERPRISE: { patients: 5000, caregivers: 500, vehicles: null, ki: true },
};

export function limitFor(plan: SubscriptionPlan, resource: LimitedResource): number | null {
  return PLAN_LIMITS[plan][resource];
}

/**
 * Effektive Limits eines Tenants: Plan-Default, optional je Ressource durch
 * `organizations.plan_limits` (JSON) überschrieben (z.B. ausgehandelte Deals).
 * Akzeptiert nur saubere Werte (Zahl >= 0, oder null = unbegrenzt); alles andere
 * fällt defensiv auf den Plan-Default zurück.
 */
export function resolvePlanLimits(
  plan: SubscriptionPlan,
  overrides: Prisma.JsonValue | null | undefined,
): PlanLimits {
  const base = PLAN_LIMITS[plan];
  if (!overrides || typeof overrides !== "object" || Array.isArray(overrides)) {
    return base;
  }
  const o = overrides as Record<string, unknown>;
  const num = (key: "patients" | "caregivers", fallback: number): number => {
    const v = o[key];
    return typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : fallback;
  };
  const vehicles = ((): number | null => {
    const v = o.vehicles;
    if (v === null) return null; // explizit unbegrenzt
    return typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : base.vehicles;
  })();
  return {
    patients: num("patients", base.patients),
    caregivers: num("caregivers", base.caregivers),
    vehicles,
    ki: typeof o.ki === "boolean" ? o.ki : base.ki,
  };
}

/** true, wenn das Anlegen einer weiteren Ressource das Limit überschreiten würde. */
export function exceedsLimit(
  plan: SubscriptionPlan,
  resource: LimitedResource,
  currentCount: number,
): boolean {
  const limit = limitFor(plan, resource);
  return limit !== null && currentCount >= limit;
}

const PLAN_VALUES = new Set(Object.keys(PLAN_LIMITS));

export function parsePlan(value: unknown): SubscriptionPlan | null {
  return typeof value === "string" && PLAN_VALUES.has(value) ? (value as SubscriptionPlan) : null;
}
