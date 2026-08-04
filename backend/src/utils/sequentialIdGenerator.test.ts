import { describe, it, expect, vi } from 'vitest';
import { Prisma } from '@prisma/client';
import { BusinessRuleError } from './errors';
import {
  buildDateSequencePrefix,
  dateStamp,
  generateWithRetry,
  isUniqueConstraintConflict,
  nextSequentialId,
} from './sequentialIdGenerator';

describe('dateStamp', () => {
  it('formats a UTC date as YYYYMMDD', () => {
    expect(dateStamp(new Date('2026-08-01T00:00:00.000Z'))).toBe('20260801');
  });

  it('zero-pads single-digit month and day', () => {
    expect(dateStamp(new Date('2026-01-05T00:00:00.000Z'))).toBe('20260105');
  });
});

describe('buildDateSequencePrefix', () => {
  it('joins prefix and date stamp with hyphens', () => {
    expect(buildDateSequencePrefix('DL', new Date('2026-08-01T00:00:00.000Z'))).toBe('DL-20260801-');
    expect(buildDateSequencePrefix('PR', new Date('2026-08-01T00:00:00.000Z'))).toBe('PR-20260801-');
  });
});

describe('nextSequentialId', () => {
  const prefix = 'DL-20260801-';

  it('returns sequence 01 when there are no existing ids', () => {
    expect(nextSequentialId(prefix, [])).toBe(`${prefix}01`);
  });

  it('increments one past the current max', () => {
    const existing = [`${prefix}01`, `${prefix}02`, `${prefix}03`];
    expect(nextSequentialId(prefix, existing)).toBe(`${prefix}04`);
  });

  it('is unaffected by ids arriving out of order', () => {
    const existing = [`${prefix}03`, `${prefix}01`, `${prefix}02`];
    expect(nextSequentialId(prefix, existing)).toBe(`${prefix}04`);
  });

  it('ignores an unparseable suffix rather than throwing', () => {
    const existing = [`${prefix}01`, `${prefix}NOT-A-NUMBER`];
    expect(nextSequentialId(prefix, existing)).toBe(`${prefix}02`);
  });
});

function makeP2002(): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: '5.22.0',
  });
}

describe('isUniqueConstraintConflict', () => {
  it('is true for a P2002 PrismaClientKnownRequestError', () => {
    expect(isUniqueConstraintConflict(makeP2002())).toBe(true);
  });

  it('is false for any other error', () => {
    expect(isUniqueConstraintConflict(new Error('boom'))).toBe(false);
    expect(isUniqueConstraintConflict(undefined)).toBe(false);
  });
});

describe('generateWithRetry', () => {
  it('succeeds on the first attempt when there is no conflict', async () => {
    const nextId = vi.fn().mockResolvedValue('DL-20260801-01');
    const attempt = vi.fn().mockResolvedValue('created');

    const result = await generateWithRetry(nextId, attempt);

    expect(result).toBe('created');
    expect(nextId).toHaveBeenCalledTimes(1);
    expect(attempt).toHaveBeenCalledWith('DL-20260801-01');
  });

  it('retries on a P2002 conflict and succeeds once the collision clears', async () => {
    const nextId = vi.fn().mockResolvedValueOnce('DL-20260801-01').mockResolvedValueOnce('DL-20260801-02');
    const attempt = vi.fn().mockRejectedValueOnce(makeP2002()).mockResolvedValueOnce('created');

    const result = await generateWithRetry(nextId, attempt);

    expect(result).toBe('created');
    expect(nextId).toHaveBeenCalledTimes(2);
    expect(attempt).toHaveBeenCalledTimes(2);
  });

  it('propagates a non-conflict error immediately without retrying', async () => {
    const nextId = vi.fn().mockResolvedValue('DL-20260801-01');
    const attempt = vi.fn().mockRejectedValue(new Error('something else broke'));

    await expect(generateWithRetry(nextId, attempt)).rejects.toThrow('something else broke');
    expect(attempt).toHaveBeenCalledTimes(1);
  });

  it('gives up after maxAttempts and throws a 409 BusinessRuleError, not the raw Prisma error', async () => {
    const nextId = vi.fn().mockResolvedValue('DL-20260801-01');
    const attempt = vi.fn().mockRejectedValue(makeP2002());

    let caught: unknown;
    try {
      await generateWithRetry(nextId, attempt, 3);
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(BusinessRuleError);
    expect((caught as BusinessRuleError).statusCode).toBe(409);
    expect((caught as Error).message).toBe('Unable to allocate a unique ID after 3 attempts, please retry.');
    expect(attempt).toHaveBeenCalledTimes(3);
  });
});
