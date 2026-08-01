/**
 * Domänen-Ereignisse.
 *
 * Warum das existiert (CLAUDE.md, "Intégrations HR tierces"): jede fachliche
 * Mutation meldet, WAS passiert ist – sie ruft nicht selbst auf, WER davon
 * erfahren soll. Der DATEV-Webhook (Phase 3) abonniert `absence.approved` &
 * Co., statt im HR-Service verdrahtet zu werden. Neue Abnehmer kommen so ohne
 * Eingriff in die Geschäftslogik dazu.
 *
 * Zwei Eigenschaften, auf die es dabei ankommt:
 *
 *   1. Veröffentlichung NACH dem Commit. Ein Abonnent, der die Datenbank liest,
 *      darf niemals einen Zustand sehen, der gleich wieder zurückgerollt wird.
 *      Deshalb sammelt withDomainEvents() die Ereignisse und gibt sie erst
 *      frei, wenn die Transaktion durch ist (Dry-Run rollt zurück -> nichts
 *      wird veröffentlicht).
 *   2. Abonnenten können den Aufrufer nicht umbringen. Ein Fehler im Handler
 *      wird geloggt, nicht geworfen: ein kaputter Konnektor darf keine
 *      Vertragsänderung scheitern lassen.
 *
 * Bewusst in-process. Sobald ein Abnehmer außerhalb des Backends sitzt, tritt
 * hier ein Outbox-Muster (Tabelle + Worker) an die Stelle des Emitters – die
 * Aufrufstellen im Service bleiben davon unberührt.
 */

import { withTenant } from "@len-len/database";
import type { TenantContext, TenantTx } from "./context.js";

export type DomainEventName =
  | "contract.created"
  | "contract.updated"
  | "contract.ended"
  | "schedule.upserted"
  | "schedule.deleted"
  | "absence.created"
  | "absence.updated"
  | "absence.approved"
  | "absence.rejected"
  | "absence.canceled";

export type DomainEntityType = "contract" | "work_schedule" | "absence";

export interface DomainEvent {
  name: DomainEventName;
  /** Tenant, in dem das Ereignis entstanden ist. */
  organizationId: string;
  /** Auslösender Benutzer; null bei System-/Worker-Aktionen. */
  actorUserId: string | null;
  entityType: DomainEntityType;
  entityId: string;
  occurredAt: Date;
  /** Fachliche Nutzlast, die ein Abnehmer ohne DB-Rückfrage braucht. */
  payload: Record<string, unknown>;
}

/** Was eine Service-Methode angibt; Tenant/Akteur/Zeit ergänzt withDomainEvents. */
export type DomainEventInput = Pick<
  DomainEvent,
  "name" | "entityType" | "entityId" | "payload"
>;

export type DomainEventHandler = (event: DomainEvent) => void | Promise<void>;

/** `*` empfängt alle Ereignisse (nützlich für Audit-/Debug-Abnehmer). */
type SubscriptionKey = DomainEventName | "*";

const handlers = new Map<SubscriptionKey, Set<DomainEventHandler>>();

/** Meldet einen Abnehmer an. Rückgabe: Abmelde-Funktion. */
export function subscribe(key: SubscriptionKey, handler: DomainEventHandler): () => void {
  const set = handlers.get(key) ?? new Set<DomainEventHandler>();
  set.add(handler);
  handlers.set(key, set);
  return () => {
    set.delete(handler);
  };
}

/** Entfernt alle Abonnenten (nur für Tests). */
export function clearSubscribers(): void {
  handlers.clear();
}

/**
 * Stellt Ereignisse zu. Wirft nie: ein fehlerhafter Handler wird protokolliert,
 * die übrigen laufen weiter.
 */
export async function publish(events: readonly DomainEvent[]): Promise<void> {
  for (const event of events) {
    const targets = [...(handlers.get(event.name) ?? []), ...(handlers.get("*") ?? [])];
    for (const handler of targets) {
      try {
        await handler(event);
      } catch (err) {
        console.warn(`[domain-events] Handler für ${event.name} fehlgeschlagen:`, err);
      }
    }
  }
}

/** Sammelt Ereignisse innerhalb einer Transaktion. */
export type EmitFn = (event: DomainEventInput) => void;

/**
 * Führt `fn` im Tenant-Kontext aus (RLS wie withTenant) und veröffentlicht die
 * gesammelten Ereignisse erst NACH erfolgreichem Commit. Wirft `fn`, wird die
 * Transaktion zurückgerollt und kein Ereignis zugestellt.
 */
export async function withDomainEvents<T>(
  ctx: TenantContext,
  fn: (tx: TenantTx, emit: EmitFn) => Promise<T>,
): Promise<T> {
  const buffer: DomainEvent[] = [];
  const emit: EmitFn = (event) => {
    buffer.push({
      ...event,
      organizationId: ctx.organizationId,
      actorUserId: ctx.userId,
      occurredAt: new Date(),
    });
  };

  const result = await withTenant(ctx.organizationId, (tx) => fn(tx, emit));
  await publish(buffer);
  return result;
}
