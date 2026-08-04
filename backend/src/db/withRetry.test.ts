import { describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';
import {
  isTransientConnectionError,
  RETRY_BACKOFF_MULTIPLIER,
  RETRY_INITIAL_BACKOFF_MS,
  RETRY_MAX_ATTEMPTS,
  withRetry,
} from './withRetry';

function knownError(code: string, message = 'simulated error'): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError(message, { code, clientVersion: 'test' });
}

function initError(errorCode?: string): Prisma.PrismaClientInitializationError {
  return new Prisma.PrismaClientInitializationError('simulated init error', 'test', errorCode);
}

describe('isTransientConnectionError', () => {
  it('treats known connection-level error codes as transient', () => {
    expect(isTransientConnectionError(knownError('P1001'))).toBe(true);
    expect(isTransientConnectionError(knownError('P1002'))).toBe(true);
    expect(isTransientConnectionError(knownError('P1008'))).toBe(true);
    expect(isTransientConnectionError(knownError('P1017'))).toBe(true);
    expect(isTransientConnectionError(initError('P1001'))).toBe(true);
  });

  it('does not treat business-logic/validation/constraint errors as transient', () => {
    expect(isTransientConnectionError(knownError('P2002'))).toBe(false); // unique constraint
    expect(isTransientConnectionError(knownError('P1000'))).toBe(false); // auth failed, not transient
    expect(isTransientConnectionError(initError('P1010'))).toBe(false); // access denied, not transient
    expect(isTransientConnectionError(initError())).toBe(false); // no error code at all
    expect(isTransientConnectionError(new Error('some other failure'))).toBe(false);
    expect(isTransientConnectionError('not even an Error object')).toBe(false);
  });
});

describe('withRetry', () => {
  it('retries a transient connection error using the documented exponential backoff, then succeeds', async () => {
    vi.useFakeTimers();
    try {
      const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');
      const operation = vi
        .fn()
        .mockRejectedValueOnce(knownError('P1001'))
        .mockRejectedValueOnce(knownError('P1001'))
        .mockResolvedValueOnce('ok');

      const resultPromise = withRetry(operation);
      await vi.runAllTimersAsync();
      const result = await resultPromise;

      expect(result).toBe('ok');
      expect(operation).toHaveBeenCalledTimes(3);

      const delays = setTimeoutSpy.mock.calls.map(([, ms]) => ms);
      expect(delays).toEqual([RETRY_INITIAL_BACKOFF_MS, RETRY_INITIAL_BACKOFF_MS * RETRY_BACKOFF_MULTIPLIER]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('gives up after RETRY_MAX_ATTEMPTS and propagates the last transient error', async () => {
    vi.useFakeTimers();
    try {
      const error = knownError('P1001');
      const operation = vi.fn().mockRejectedValue(error);

      const resultPromise = withRetry(operation);
      const assertion = expect(resultPromise).rejects.toBe(error);
      await vi.runAllTimersAsync();
      await assertion;

      expect(operation).toHaveBeenCalledTimes(RETRY_MAX_ATTEMPTS);
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not retry a non-transient error (e.g. unique constraint violation) and propagates immediately', async () => {
    const uniqueError = knownError('P2002', 'Unique constraint failed on the fields: (`part_id`)');
    const operation = vi.fn().mockRejectedValue(uniqueError);

    await expect(withRetry(operation)).rejects.toBe(uniqueError);
    expect(operation).toHaveBeenCalledTimes(1);
  });
});
