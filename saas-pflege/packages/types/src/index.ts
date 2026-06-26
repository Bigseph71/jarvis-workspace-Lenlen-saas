// Geteilte Typen zwischen Backend, Worker und (perspektivisch) Frontend.
// Prisma-Modelle werden direkt aus @len-len/database importiert; hier nur
// API-/Transport-Typen, die nicht aus dem DB-Schema stammen.

export type WeekDay = "MON" | "TUE" | "WED" | "THU" | "FRI" | "SAT" | "SUN";

export interface VrptwJob {
  organizationId: string;
  routeId: string;
  date: string; // ISO yyyy-mm-dd
}

export interface VrptwResult {
  optimized: boolean;
  partial: boolean;
  vrptwScore: number;
  totalKm: number;
}
