import type { FastifyInstance, FastifyRequest } from "fastify";
import { UserRole } from "@len-len/database";
import { authenticate } from "../../plugins/authenticate.js";
import { requireRole } from "../../plugins/rbac.js";
import type { TenantContext } from "../../lib/context.js";
import { listMessagesQuerySchema, sendMessageSchema } from "./chat.schemas.js";
import { listMessages, sendMessage, unreadCount } from "./chat.service.js";

// Chat: Fachkraft + Planungsebene (HR hat keinen Zugriff).
const canChat = requireRole(
  UserRole.SUPER_ADMIN,
  UserRole.STRUKTUR_ADMIN,
  UserRole.KOORDINATOR,
  UserRole.FACHKRAFT,
);

function ctxFrom(req: FastifyRequest): TenantContext {
  return { organizationId: req.user!.organizationId, userId: req.user!.userId };
}

function actorFrom(req: FastifyRequest): { role: UserRole } {
  return { role: req.user!.role as UserRole };
}

export async function chatRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", authenticate);

  // Konversation lesen (markiert eingehende Nachrichten als gelesen).
  app.get("/chat/messages", { preHandler: [canChat] }, async (request) => {
    const query = listMessagesQuerySchema.parse(request.query);
    return listMessages(ctxFrom(request), actorFrom(request), query);
  });

  app.post("/chat/messages", { preHandler: [canChat] }, async (request, reply) => {
    const input = sendMessageSchema.parse(request.body);
    const message = await sendMessage(ctxFrom(request), actorFrom(request), input);
    return reply.status(201).send(message);
  });

  // Badge: ungelesene eingehende Nachrichten.
  app.get("/chat/unread-count", { preHandler: [canChat] }, async (request) => {
    return unreadCount(ctxFrom(request), actorFrom(request));
  });
}
