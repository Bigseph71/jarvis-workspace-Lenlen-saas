import { z } from "zod";

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export type Pagination = z.infer<typeof paginationSchema>;

// Query-Booleans kommen als String. z.coerce.boolean() macht aus "false" ein
// true (truthy String) – daher dieser explizite Parser. Fehlt der Wert -> false.
export const booleanQuery = z
  .enum(["true", "false", "1", "0"])
  .optional()
  .transform((v) => v === "true" || v === "1");

export interface Paginated<T> {
  data: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export function toSkipTake({ page, pageSize }: Pagination): { skip: number; take: number } {
  return { skip: (page - 1) * pageSize, take: pageSize };
}

export function paginated<T>(data: T[], total: number, { page, pageSize }: Pagination): Paginated<T> {
  return { data, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
}
