import type { FastifyInstance, FastifyRequest } from "fastify";
import { requireSuperAdmin } from "../../plugins/require-super-admin.js";
import {
  auditLogExportQuerySchema,
  auditLogQuerySchema,
  deleteOrganizationSchema,
  listOrganizationsQuerySchema,
  organizationIdParamSchema,
  updateOrganizationSchema,
} from "./admin.schemas.js";
import {
  exportAuditLogsCsv,
  getDashboard,
  getOrganization,
  listAuditLogs,
  listOrganizations,
  softDeleteOrganization,
  updateOrganization,
  type AdminContext,
} from "./admin.service.js";

/**
 * Super-Admin-Panel.
 *
 * Der Wächter hängt als Hook über dem gesamten Plugin: eine neue Route unter
 * /admin ist damit von selbst geschützt, statt darauf angewiesen zu sein, dass
 * jemand den preHandler mitschreibt. Genau dieses Vergessen hatte die
 * WebSocket-Streams offen gelassen.
 *
 * Die Abfragen dieser Routen tragen KEINEN organization_id-Filter – das ist
 * beabsichtigt und der Zweck des Panels.
 */
export async function adminRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", requireSuperAdmin);

  function ctxFrom(request: FastifyRequest): AdminContext {
    return { userId: request.user!.userId };
  }

  app.get("/admin/dashboard", async () => getDashboard());

  app.get("/admin/organizations", async (request) => {
    const query = listOrganizationsQuerySchema.parse(request.query);
    return listOrganizations(query);
  });

  app.get("/admin/organizations/:id", async (request) => {
    const { id } = organizationIdParamSchema.parse(request.params);
    return getOrganization(id);
  });

  app.patch("/admin/organizations/:id", async (request) => {
    const { id } = organizationIdParamSchema.parse(request.params);
    const input = updateOrganizationSchema.parse(request.body);
    return updateOrganization(ctxFrom(request), id, input);
  });

  app.delete("/admin/organizations/:id", async (request) => {
    const { id } = organizationIdParamSchema.parse(request.params);
    // Die Begründung steht im Body – auch bei DELETE. Sie in die Query zu
    // legen hiesse, den Löschgrund eines Kunden in jedes Zugriffslog zu
    // schreiben, das die URL mitschneidet.
    const input = deleteOrganizationSchema.parse(request.body);
    return softDeleteOrganization(ctxFrom(request), id, input);
  });

  app.get("/admin/audit-logs", async (request) => {
    const query = auditLogQuerySchema.parse(request.query);
    return listAuditLogs(query);
  });

  app.get("/admin/audit-logs/export", async (request, reply) => {
    const query = auditLogExportQuerySchema.parse(request.query);
    const csv = await exportAuditLogsCsv(query);

    const stamp = new Date().toISOString().slice(0, 10);
    reply
      .header("content-type", "text/csv; charset=utf-8")
      .header("content-disposition", `attachment; filename="audit-log-${stamp}.csv"`);
    return csv;
  });
}
