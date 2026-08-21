import type { UserRole } from "@len-len/api-client";

/**
 * Spiegel der requireRole()-Wächter des Backends.
 *
 * KEINE Absicherung – die leistet das Backend – sondern die Grundlage dafür,
 * gar nicht erst anzubieten, was ohnehin mit 403 endet. Ein Koordinator sah
 * bislang "Neue Fachkraft", füllte das Formular aus und bekam am Ende
 * "Etwas ist schiefgelaufen": ein Vorgang, den kein Wiederholen retten kann.
 *
 * Wer einen Wächter im Backend ändert, pflegt hier mit.
 *
 * SUPER_ADMIN kommt in KEINER dieser Listen vor: er sieht keine Daten eines
 * Tenants (Datenminimierung, siehe plugins/rbac.ts). Seine einzige Fähigkeit
 * steht unten in canAccessAdminPanel.
 */

const PLANNING: readonly UserRole[] = ["STRUKTUR_ADMIN", "KOORDINATOR"];
const ADMIN: readonly UserRole[] = ["STRUKTUR_ADMIN"];

function has(role: UserRole | undefined, allowed: readonly UserRole[]): boolean {
  return role !== undefined && allowed.includes(role);
}

/** Fachkräfte anlegen, bearbeiten, Vertrag pflegen (caregiver.routes.ts: canWrite). */
export function canManageCaregivers(role: UserRole | undefined): boolean {
  return has(role, [...ADMIN, "HR"]);
}

/** Patienten anlegen und bearbeiten (patient.routes.ts: canManage). */
export function canManagePatients(role: UserRole | undefined): boolean {
  return has(role, PLANNING);
}

/** Besuche planen (visit.routes.ts: canPlan). */
export function canPlanVisits(role: UserRole | undefined): boolean {
  return has(role, PLANNING);
}

/** HR-Daten schreiben: Verträge, Dienstpläne, Abwesenheiten (hr.routes.ts: canWrite). */
export function canManageHr(role: UserRole | undefined): boolean {
  return has(role, [...ADMIN, "HR"]);
}

/**
 * Super-Admin-Panel (/admin, Backend: requireSuperAdmin).
 *
 * Nur diese eine Rolle – und ausdrücklich NICHT die ADMIN-Liste oben, in der
 * auch STRUKTUR_ADMIN steht. Der Struktur-Admin ist in seiner Organisation
 * allmächtig; das Panel geht über alle Organisationen.
 */
export function canAccessAdminPanel(role: UserRole | undefined): boolean {
  return role === "SUPER_ADMIN";
}
