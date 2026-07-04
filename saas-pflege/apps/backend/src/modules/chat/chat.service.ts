import { UserRole, withTenant } from "@len-len/database";
import { AppError, ForbiddenError } from "../../lib/errors.js";
import type { TenantContext, TenantTx } from "../../lib/context.js";
import type { ListMessagesQuery, SendMessageInput } from "./chat.schemas.js";

/**
 * Chat Fachkraft <-> Koordination (MVP, Polling).
 *
 * Modell: eine Konversation pro Fachkraft (caregiverId = Schlüssel).
 * - Fachkraft: sieht nur die eigene Konversation (caregiverId aus dem Konto).
 * - Planer (Koordinator / Struktur-Admin / Super-Admin): jede Konversation,
 *   caregiverId ist dann Pflicht.
 * readAt markiert Nachrichten als vom Empfänger-Lager gelesen: beim Abruf
 * durch die Fachkraft werden Planer-Nachrichten als gelesen markiert und
 * umgekehrt.
 */

interface ChatActor {
  role: UserRole;
}

const MESSAGE_INCLUDE = {
  sender: { select: { id: true, email: true, role: true } },
} as const;

/** Löst die Konversation (caregiverId) für den Akteur auf. */
async function resolveCaregiverId(
  tx: TenantTx,
  ctx: TenantContext,
  actor: ChatActor,
  requested: string | undefined,
): Promise<string> {
  if (actor.role === UserRole.FACHKRAFT) {
    if (requested !== undefined) {
      throw new ForbiddenError("Fachkräfte haben nur Zugriff auf die eigene Konversation");
    }
    const caregiver = await tx.caregiver.findFirst({
      where: { userId: ctx.userId, organizationId: ctx.organizationId },
      select: { id: true },
    });
    if (!caregiver) throw new ForbiddenError("Kein Fachkraft-Profil mit deinem Konto verknüpft");
    return caregiver.id;
  }

  if (!requested) {
    throw new AppError(422, "caregiverId ist für Planer erforderlich", "UnprocessableEntity");
  }
  const caregiver = await tx.caregiver.findFirst({
    where: { id: requested, organizationId: ctx.organizationId },
    select: { id: true },
  });
  if (!caregiver) throw new AppError(422, "Fachkraft nicht gefunden", "UnprocessableEntity");
  return caregiver.id;
}

/** Gegenseite: Nachrichten, die NICHT vom eigenen Lager stammen. */
function incomingFilter(actor: ChatActor) {
  return actor.role === UserRole.FACHKRAFT
    ? { sender: { role: { not: UserRole.FACHKRAFT } } }
    : { sender: { role: UserRole.FACHKRAFT } };
}

export async function sendMessage(
  ctx: TenantContext,
  actor: ChatActor,
  input: SendMessageInput,
): Promise<unknown> {
  return withTenant(ctx.organizationId, async (tx) => {
    const caregiverId = await resolveCaregiverId(tx, ctx, actor, input.caregiverId);
    return tx.message.create({
      data: {
        organizationId: ctx.organizationId,
        caregiverId,
        senderUserId: ctx.userId as string,
        body: input.body,
      },
      include: MESSAGE_INCLUDE,
    });
  });
}

export async function listMessages(
  ctx: TenantContext,
  actor: ChatActor,
  query: ListMessagesQuery,
): Promise<unknown> {
  return withTenant(ctx.organizationId, async (tx) => {
    const caregiverId = await resolveCaregiverId(tx, ctx, actor, query.caregiverId);
    const messages = await tx.message.findMany({
      where: {
        organizationId: ctx.organizationId,
        caregiverId,
        ...(query.after ? { createdAt: { gt: query.after } } : {}),
      },
      orderBy: { createdAt: "asc" },
      take: query.limit,
      include: MESSAGE_INCLUDE,
    });

    // Eingehende Nachrichten beim Abruf als gelesen markieren.
    await tx.message.updateMany({
      where: {
        organizationId: ctx.organizationId,
        caregiverId,
        readAt: null,
        ...incomingFilter(actor),
      },
      data: { readAt: new Date() },
    });

    return { caregiverId, count: messages.length, messages };
  });
}

/** Anzahl ungelesener eingehender Nachrichten (Badge). */
export async function unreadCount(ctx: TenantContext, actor: ChatActor): Promise<unknown> {
  return withTenant(ctx.organizationId, async (tx) => {
    if (actor.role === UserRole.FACHKRAFT) {
      const caregiverId = await resolveCaregiverId(tx, ctx, actor, undefined);
      const count = await tx.message.count({
        where: {
          organizationId: ctx.organizationId,
          caregiverId,
          readAt: null,
          ...incomingFilter(actor),
        },
      });
      return { count };
    }
    // Planer: über alle Konversationen hinweg.
    const count = await tx.message.count({
      where: { organizationId: ctx.organizationId, readAt: null, ...incomingFilter(actor) },
    });
    return { count };
  });
}
