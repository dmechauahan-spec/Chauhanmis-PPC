import { Prisma } from '@prisma/client';

// Up to 3 attempts total (1 initial + 2 retries), waiting RETRY_INITIAL_BACKOFF_MS
// * RETRY_BACKOFF_MULTIPLIER^attempt between them — i.e. 200ms, then 400ms.
export const RETRY_MAX_ATTEMPTS = 3;
export const RETRY_INITIAL_BACKOFF_MS = 200;
export const RETRY_BACKOFF_MULTIPLIER = 2;

// Connection-level Prisma error codes worth retrying — see
// https://www.prisma.io/docs/orm/reference/error-reference. Deliberately
// excludes config/auth/schema errors (P1000 auth failed, P1003 db doesn't
// exist, P1010 access denied, P1011 TLS, ...) which are not transient and
// would just fail identically on retry.
const TRANSIENT_CONNECTION_ERROR_CODES = new Set([
  'P1001', // Can't reach database server
  'P1002', // Database server was reached but timed out
  'P1008', // Operations timed out
  'P1017', // Server has closed the connection
]);

export function isTransientConnectionError(error: unknown): boolean {
  const code =
    error instanceof Prisma.PrismaClientKnownRequestError
      ? error.code
      : error instanceof Prisma.PrismaClientInitializationError
        ? error.errorCode
        : undefined;
  return code !== undefined && TRANSIENT_CONNECTION_ERROR_CODES.has(code);
}

function backoffDelayMs(attemptIndex: number): number {
  return RETRY_INITIAL_BACKOFF_MS * RETRY_BACKOFF_MULTIPLIER ** attemptIndex;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retries `operation` on transient Prisma connection errors only (see
 * TRANSIENT_CONNECTION_ERROR_CODES) — up to RETRY_MAX_ATTEMPTS attempts, with
 * exponential backoff between them. Any other error (business-logic,
 * validation, unique-constraint, etc.) propagates immediately on first
 * failure, unretried.
 *
 * Callers are responsible for only wrapping operations that are safe to
 * re-run — see src/db/client.ts and README "Connectivity resilience" for
 * which Prisma operations this is (and is deliberately not) applied to.
 */
export async function withRetry<T>(operation: () => Promise<T>): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt < RETRY_MAX_ATTEMPTS; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      const isLastAttempt = attempt === RETRY_MAX_ATTEMPTS - 1;
      if (!isTransientConnectionError(error) || isLastAttempt) {
        throw error;
      }
      await sleep(backoffDelayMs(attempt));
    }
  }

  throw lastError;
}
