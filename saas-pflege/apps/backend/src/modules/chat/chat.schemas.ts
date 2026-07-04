import { z } from "zod";

/** Nachricht senden. caregiverId: Pflicht für Planer, verboten für Fachkraft. */
export const sendMessageSchema = z.object({
  body: z.string().trim().min(1).max(2000),
  caregiverId: z.string().uuid().optional(),
});

/** Konversation lesen (Polling: after = nur neuere Nachrichten). */
export const listMessagesQuerySchema = z.object({
  caregiverId: z.string().uuid().optional(),
  after: z.coerce.date().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export const markReadSchema = z.object({
  caregiverId: z.string().uuid().optional(),
});

export type SendMessageInput = z.infer<typeof sendMessageSchema>;
export type ListMessagesQuery = z.infer<typeof listMessagesQuerySchema>;
export type MarkReadInput = z.infer<typeof markReadSchema>;
