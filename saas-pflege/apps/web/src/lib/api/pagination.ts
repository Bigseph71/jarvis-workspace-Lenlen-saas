/** Generische paginierte Antwort (siehe lib/pagination.ts im Backend). */
export interface Paginated<T> {
  data: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}
