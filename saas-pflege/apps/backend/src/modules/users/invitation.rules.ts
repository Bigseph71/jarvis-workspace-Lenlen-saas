/**
 * Wann ein Einladungslink brauchbar ist – als reine Funktion, damit die Regel
 * ohne Datenbank prüfbar bleibt.
 *
 * Vier Bedingungen, und jede hat einen Fall hinter sich, in dem das Gegenteil
 * falsch wäre:
 *  - noch nicht eingelöst, sonst liesse sich ein weitergeleiteter Link ein
 *    zweites Mal benutzen, nachdem die Fachkraft ihr Passwort gesetzt hat;
 *  - nicht abgelaufen, sonst öffnet ein in einer Chat-Gruppe vergessener Link
 *    das Konto noch Monate später;
 *  - das Konto ist aktiv, sonst bekäme eine ausgeschiedene Fachkraft über
 *    einen alten Link wieder Zugang;
 *  - die Organisation ist nicht gelöscht, sonst entstünde ein Zugang zu einem
 *    Tenant, dessen Anmeldung sonst überall abgewiesen wird.
 */
export interface InvitationState {
  usedAt: Date | null;
  expiresAt: Date;
  user: { isActive: boolean };
  organization: { deletedAt: Date | null };
}

export function isInvitationUsable(
  invitation: InvitationState | null,
  now: Date = new Date(),
): boolean {
  if (invitation === null) return false;
  return (
    invitation.usedAt === null &&
    invitation.expiresAt > now &&
    invitation.user.isActive &&
    invitation.organization.deletedAt === null
  );
}
