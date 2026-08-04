export class AppError extends Error {
  statusCode: number;
  details?: unknown;

  constructor(message: string, statusCode: number, details?: unknown) {
    super(message);
    this.name = new.target.name;
    this.statusCode = statusCode;
    this.details = details;
    Error.captureStackTrace?.(this, this.constructor);
  }
}

export class ValidationError extends AppError {
  constructor(message = 'Validation failed', details?: unknown) {
    super(message, 400, details);
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string, identifier?: string | number) {
    super(
      identifier === undefined ? `${resource} not found` : `${resource} '${identifier}' not found`,
      404,
    );
  }
}

// Authentication & Authorization. UnauthorizedError (401): missing, invalid,
// expired, or otherwise unauthenticatable credentials — the caller's
// identity itself couldn't be established. ForbiddenError (403): identity
// was established, but that identity isn't allowed to do this — a
// deactivated account, or a role that isn't in the endpoint's allowed list.
export class UnauthorizedError extends AppError {
  constructor(message = 'Authentication required') {
    super(message, 401);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'You do not have permission to perform this action') {
    super(message, 403);
  }
}

export class TooManyRequestsError extends AppError {
  constructor(message = 'Too many attempts. Please try again later.') {
    super(message, 429);
  }
}

export class BusinessRuleError extends AppError {
  constructor(message: string, details?: unknown, statusCode = 409) {
    super(message, statusCode, details);
  }
}

// Module 5 (BOM Explosion) — these are thrown by the pure explodeBom() engine
// itself (see bomExplosionEngine.ts), not by any DB/service code, but they
// extend AppError so the existing centralized errorHandler maps them to 409
// (a well-formed request that ran into bad/cyclic BOM master data) instead of
// a generic 500, with no changes needed to errorHandler.
export class BomCycleError extends AppError {
  constructor(cyclePath: string[]) {
    super(`Cycle detected while exploding BOM: ${cyclePath.join(' -> ')}`, 409, { cyclePath });
  }
}

export class BomDepthExceededError extends AppError {
  constructor(maxDepth: number, sku: string) {
    super(
      `BOM explosion exceeded the max depth of ${maxDepth} while resolving '${sku}'. Check the BOM master data for an unintended sub-assembly chain.`,
      409,
      { maxDepth, sku },
    );
  }
}
