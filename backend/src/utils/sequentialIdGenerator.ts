import { Prisma } from '@prisma/client';
import { BusinessRuleError } from './errors';

// Shared date-sequence-with-retry-on-collision id scheme, originally built
// for Module 3's log_id and reused as-is by Module 9's prNumber. Every
// caller supplies its own prefix (e.g. "DL", "PR") and fetches its own
// existing-ids-for-today's-prefix rows (the query differs per table) — this
// module only owns the id math (parse/increment/format) and the retry loop,
// not any Prisma model access.

function pad2(n: number): string {
  return n.toString().padStart(2, '0');
}

// UTC-based YYYYMMDD stamp.
export function dateStamp(date: Date): string {
  return `${date.getUTCFullYear()}${pad2(date.getUTCMonth() + 1)}${pad2(date.getUTCDate())}`;
}

// e.g. buildDateSequencePrefix('DL', date) -> 'DL-20260801-'
export function buildDateSequencePrefix(prefix: string, date: Date): string {
  return `${prefix}-${dateStamp(date)}-`;
}

/**
 * Given a full prefix (already date-stamped, e.g. `DL-20260801-`) and every
 * existing id sharing that prefix, returns the next id in the sequence:
 * `prefix` + a 2-digit zero-padded sequence number, one more than the
 * current max. Pure — the caller is responsible for fetching `existingIds`
 * and for actually writing the returned id.
 */
export function nextSequentialId(prefix: string, existingIds: string[]): string {
  const maxSeq = existingIds.reduce((max, id) => {
    const seq = parseInt(id.slice(prefix.length), 10);
    return Number.isNaN(seq) ? max : Math.max(max, seq);
  }, 0);
  return `${prefix}${pad2(maxSeq + 1)}`;
}

// The only unique constraint a sequential-id insert should ever hit is the
// generated id's own primary key, so a bare P2002 always means "sequence
// number collision" — safe to retry unconditionally.
export function isUniqueConstraintConflict(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
}

function allocationExhaustedError(maxAttempts: number): BusinessRuleError {
  return new BusinessRuleError(`Unable to allocate a unique ID after ${maxAttempts} attempts, please retry.`);
}

/**
 * Runs `attempt(id)` up to `maxAttempts` times, calling `nextId()` fresh
 * before each try. Retries only on a unique-constraint violation (P2002);
 * any other error propagates immediately. Two concurrent callers can race to
 * the same candidate id — this loop is what recovers from that instead of
 * taking a DB-level lock, same tradeoff Module 3 originally documented for
 * logId and Module 9 mirrored for prNumber.
 *
 * If every attempt collides, a well-formed `BusinessRuleError` (409) is
 * thrown instead of letting the raw Prisma P2002 propagate to the client —
 * the generic errorHandler would otherwise turn that into an unhelpful
 * "Unique constraint violation" response that doesn't explain what actually
 * happened (retry exhaustion under contention, not a genuine duplicate
 * submitted by the caller).
 */
export async function generateWithRetry<T>(
  nextId: () => Promise<string>,
  attempt: (id: string) => Promise<T>,
  maxAttempts = 5,
): Promise<T> {
  for (let i = 0; i < maxAttempts; i++) {
    const id = await nextId();
    try {
      return await attempt(id);
    } catch (err) {
      if (!isUniqueConstraintConflict(err)) {
        throw err;
      }
      if (i < maxAttempts - 1) {
        continue;
      }
      throw allocationExhaustedError(maxAttempts);
    }
  }
  // Unreachable: every iteration above either returns or throws. Kept only
  // to satisfy the return type without a non-null assertion.
  throw allocationExhaustedError(maxAttempts);
}
