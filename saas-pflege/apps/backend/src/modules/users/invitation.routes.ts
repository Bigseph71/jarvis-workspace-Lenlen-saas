import type { FastifyInstance } from "fastify";
import { acceptInvitation, previewInvitation } from "./invitation.service.js";
import { acceptInvitationSchema, invitationParamSchema } from "./invitation.schemas.js";

/**
 * Einladungen – die einzigen Endpunkte des Benutzermoduls OHNE Anmeldung.
 *
 * Sie stehen deshalb in einem eigenen Plugin: user.routes.ts hängt
 * `authenticate` als preHandler über den gesamten Plugin-Umfang, und eine
 * öffentliche Route dort unterzubringen hiesse, diese Sperre für eine
 * Ausnahme zu lockern. Getrennte Plugins machen die Ausnahme sichtbar, statt
 * sie in einer Bedingung zu verstecken.
 *
 * Kein Tenant-Kontext: wer einen Einladungslink öffnet, ist noch niemand. Der
 * Service arbeitet daher über den System-Pfad, wie der Login.
 */
const strictLimit = { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } };

export async function invitationRoutes(app: FastifyInstance): Promise<void> {
  // Was der Bildschirm vor der Eingabe anzeigt: für welches Konto der Link gilt.
  app.get("/auth/invitation/:token", strictLimit, async (request) => {
    const { token } = invitationParamSchema.parse(request.params);
    return previewInvitation(token);
  });

  // Passwort setzen und Link verbrauchen.
  app.post("/auth/invitation/:token", strictLimit, async (request) => {
    const { token } = invitationParamSchema.parse(request.params);
    const { password } = acceptInvitationSchema.parse(request.body);
    return acceptInvitation(token, password);
  });
}
