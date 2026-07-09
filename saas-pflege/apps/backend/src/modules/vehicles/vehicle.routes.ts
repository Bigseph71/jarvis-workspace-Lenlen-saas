import { z } from "zod";
import type { FastifyInstance } from "fastify";
import { UserRole } from "@len-len/database";
import { authenticate } from "../../plugins/authenticate.js";
import { requireRole } from "../../plugins/rbac.js";
import type { TenantContext } from "../../lib/context.js";
import {
  createVehicleSchema,
  updateVehicleSchema,
  addKmSchema,
  listVehiclesQuerySchema,
  assignRouteQuerySchema,
} from "./vehicle.schemas.js";
import {
  listVehicles,
  getVehicle,
  createVehicle,
  updateVehicle,
  addKm,
  deactivateVehicle,
  assignRoute,
} from "./vehicle.service.js";

const idParamSchema = z.object({ id: z.string().uuid() });

// Leasing-Verwaltung: nur Struktur-Admin (Super-Admin als Obermenge).
const canManage = requireRole(UserRole.SUPER_ADMIN, UserRole.STRUKTUR_ADMIN);
// Fahrzeugzuweisung dient der Planung/VRPTW: zusätzlich Koordinator.
const canAssign = requireRole(
  UserRole.SUPER_ADMIN,
  UserRole.STRUKTUR_ADMIN,
  UserRole.KOORDINATOR,
);

function ctxFrom(req: { user?: { userId: string; organizationId: string } }): TenantContext {
  return { organizationId: req.user!.organizationId, userId: req.user!.userId };
}

export async function vehicleRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", authenticate);

  // Regel 6 (VRPTW): am wenigsten genutztes Fahrzeug für eine Fahrt.
  // Vor der :id-Route registriert, damit "assign-route" nicht als id gematcht wird.
  app.get("/vehicles/assign-route", { preHandler: [canAssign] }, async (request) => {
    const { km } = assignRouteQuerySchema.parse(request.query);
    return assignRoute(ctxFrom(request), km);
  });

  app.get("/vehicles", { preHandler: [canManage] }, async (request) => {
    const query = listVehiclesQuerySchema.parse(request.query);
    return listVehicles(ctxFrom(request), query);
  });

  app.get("/vehicles/:id", { preHandler: [canManage] }, async (request) => {
    const { id } = idParamSchema.parse(request.params);
    return getVehicle(ctxFrom(request), id);
  });

  app.post("/vehicles", { preHandler: [canManage] }, async (request, reply) => {
    const input = createVehicleSchema.parse(request.body);
    const vehicle = await createVehicle(ctxFrom(request), input);
    return reply.status(201).send(vehicle);
  });

  app.put("/vehicles/:id", { preHandler: [canManage] }, async (request) => {
    const { id } = idParamSchema.parse(request.params);
    const input = updateVehicleSchema.parse(request.body);
    return updateVehicle(ctxFrom(request), id, input);
  });

  // Kilometerstand nach einer Tour erhöhen.
  app.put("/vehicles/:id/km", { preHandler: [canManage] }, async (request) => {
    const { id } = idParamSchema.parse(request.params);
    const { km } = addKmSchema.parse(request.body);
    return addKm(ctxFrom(request), id, km);
  });

  app.delete("/vehicles/:id", { preHandler: [canManage] }, async (request, reply) => {
    const { id } = idParamSchema.parse(request.params);
    await deactivateVehicle(ctxFrom(request), id);
    return reply.status(204).send();
  });
}
