/** Fehlerform des Backends (siehe zentraler Error-Handler im Backend). */
export interface ApiErrorBody {
  error: string;
  message?: string;
  details?: Record<string, string[]>;
}

/** Geworfen, wenn das Backend einen Nicht-2xx-Status liefert. */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: Record<string, string[]>,
  ) {
    super(message);
    this.name = "ApiError";
  }
}
