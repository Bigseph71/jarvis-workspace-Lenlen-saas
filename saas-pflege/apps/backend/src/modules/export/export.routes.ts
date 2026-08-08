import { z } from "zod";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { UserRole } from "@len-len/database";
import { authenticate } from "../../plugins/authenticate.js";
import { requireRole } from "../../plugins/rbac.js";
import type { TenantContext } from "../../lib/context.js";
import { exportCaregiver, exportPatient, exportSelf } from "./export.service.js";
import { anonymizeCaregiver } from "./erasure.service.js";

const idParamSchema = z.object({ id: z.string().uuid() });

// Patientenauskunft: dieselbe Abgrenzung wie die Patientenverwaltung. HR ist
// laut RBAC von Patientendaten ausgeschlossen, auch auf diesem Weg.
const canExportPatient = requireRole(UserRole.SUPER_ADMIN, UserRole.STRUKTUR_ADMIN);

// Beschäftigtenauskunft: Admin-Ebene und HR – deren Modul verwaltet Verträge,
// Zeiten und Abwesenheiten, also genau diesen Datenbestand.
const canExportCaregiver = requireRole(UserRole.SUPER_ADMIN, UserRole.STRUKTUR_ADMIN, UserRole.HR);

function ctxFrom(req: FastifyRequest): TenantContext {
  return { organizationId: req.user!.organizationId, userId: req.user!.userId };
}

/**
 * Als Download ausliefern statt im Browser anzuzeigen: die Auskunft ist eine
 * Datei, die die betroffene Person aufbewahrt oder weiterreicht (Art. 20).
 */
function asDownload(reply: FastifyReply, name: string): FastifyReply {
  const stamp = new Date().toISOString().slice(0, 10);
  return reply
    .header("Content-Type", "application/json; charset=utf-8")
    .header("Content-Disposition", `attachment; filename="auskunft-${name}-${stamp}.json"`);
}

export async function exportRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", authenticate);

  // Selbstauskunft: bewusst OHNE Rollenprüfung. Art. 15 steht jeder betroffenen
  // Person zu, unabhängig von ihren Rechten im System.
  app.get("/export/me", async (request, reply) => {
    const data = await exportSelf(ctxFrom(request));
    return asDownload(reply, "eigene-daten").send(data);
  });

  app.get("/export/patients/:id", { preHandler: [canExportPatient] }, async (request, reply) => {
    const { id } = idParamSchema.parse(request.params);
    const data = await exportPatient(ctxFrom(request), id);
    return asDownload(reply, `patient-${id}`).send(data);
  });

  app.get("/export/caregivers/:id", { preHandler: [canExportCaregiver] }, async (request, reply) => {
    const { id } = idParamSchema.parse(request.params);
    const data = await exportCaregiver(ctxFrom(request), id);
    return asDownload(reply, `fachkraft-${id}`).send(data);
  });

  // Loeschung (Art. 17). Enger gefasst als der Export: HR darf Auskunft geben,
  // aber nicht unwiderruflich anonymisieren – der Vorgang ist nicht umkehrbar
  // und beruehrt die Pflegedokumentation.
  app.delete(
    "/erasure/caregivers/:id",
    { preHandler: [requireRole(UserRole.SUPER_ADMIN, UserRole.STRUKTUR_ADMIN)] },
    async (request) => {
      const { id } = idParamSchema.parse(request.params);
      return anonymizeCaregiver(ctxFrom(request), id);
    },
  );
}
