import { z } from "zod";

/**
 * Eingehende Positionsmeldung der Mobile-App (Fachkraft). visitId optional:
 * ohne aktiven Besuch gibt es keinen Geofence-Bezug. recordedAt erlaubt das
 * Nachreichen von Offline-Punkten mit echtem Gerätezeitstempel.
 */
export const postPositionSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  accuracy: z.number().nonnegative().optional(),
  visitId: z.string().uuid().optional(),
  recordedAt: z.string().datetime().optional(),
});

export type PostPositionInput = z.infer<typeof postPositionSchema>;
