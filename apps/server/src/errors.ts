/**
 * Custom error classes for the service layer.
 *
 * Services throw these; handlers catch and format them
 * into appropriate HTTP/MCP responses.
 */

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;

  constructor(message: string, statusCode: number, code: string) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Authentication required') {
    super(message, 401, 'UNAUTHORIZED');
    this.name = 'UnauthorizedError';
  }
}

export class NotFoundError extends AppError {
  constructor(entity: string, id?: string) {
    const msg = id ? `${entity} '${id}' not found` : `${entity} not found`;
    super(msg, 404, 'NOT_FOUND');
    this.name = 'NotFoundError';
  }
}

export class ValidationError extends AppError {
  public readonly details: Record<string, string>;

  constructor(message: string, details: Record<string, string> = {}) {
    super(message, 400, 'VALIDATION_ERROR');
    this.name = 'ValidationError';
    this.details = details;
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super(message, 409, 'CONFLICT');
    this.name = 'ConflictError';
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'You do not have permission to perform this action') {
    super(message, 403, 'FORBIDDEN');
    this.name = 'ForbiddenError';
  }
}

export class CycleDetectedError extends ConflictError {
  public readonly cycle: string[];

  constructor(cycle: string[]) {
    super(`Dependency cycle detected: ${cycle.join(' → ')}`);
    this.name = 'CycleDetectedError';
    this.cycle = cycle;
  }
}

export class AmbiguousMatchError extends AppError {
  public readonly candidates: Array<{ id: string; title: string }>;

  constructor(query: string, candidates: Array<{ id: string; title: string }>) {
    const count = candidates.length;
    super(
      `${count} items match '${query}'; pass a specific ID. Candidates: ${candidates.map((c) => `${c.title} (${c.id})`).join(', ')}`,
      400,
      'AMBIGUOUS_MATCH',
    );
    this.name = 'AmbiguousMatchError';
    this.candidates = candidates;
  }
}

export class ConfirmationRequiredError extends AppError {
  public readonly confirmToken: string;
  public readonly consequences: string;

  constructor(confirmToken: string, consequences: string) {
    super(`Confirmation required: ${consequences}`, 400, 'CONFIRMATION_REQUIRED');
    this.name = 'ConfirmationRequiredError';
    this.confirmToken = confirmToken;
    this.consequences = consequences;
  }
}
