import type { SubscriptionPlan } from "@len-len/database";

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
