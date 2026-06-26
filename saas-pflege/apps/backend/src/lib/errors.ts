/**
 * Anwendungsfehler mit HTTP-Status. Wird vom zentralen Error-Handler
 * (siehe index.ts) in eine saubere JSON-Antwort übersetzt.
 */
export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly code: string = "Error",
  ) {
    super(message);
    this.name = "AppError";
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "Nicht authentifiziert") {
    super(401, message, "Unauthorized");
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "Keine Berechtigung") {
    super(403, message, "Forbidden");
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super(409, message, "Conflict");
  }
}
