import { describe, expect, it } from 'vitest';
import { envSchema } from './env';

const VALID_BASE = {
  DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
  JWT_SECRET: 'a'.repeat(32),
};

describe('envSchema — JWT_SECRET strength validation', () => {
  it('accepts a JWT_SECRET at exactly the 32-character minimum', () => {
    const result = envSchema.safeParse({ ...VALID_BASE, JWT_SECRET: 'a'.repeat(32) });
    expect(result.success).toBe(true);
  });

  it('rejects a JWT_SECRET shorter than 32 characters, with a clear message', () => {
    const result = envSchema.safeParse({ ...VALID_BASE, JWT_SECRET: 'too-short-secret' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.JWT_SECRET).toContain(
        'JWT_SECRET must be at least 32 characters',
      );
    }
  });

  it('rejects a missing/empty JWT_SECRET', () => {
    const result = envSchema.safeParse({ ...VALID_BASE, JWT_SECRET: '' });
    expect(result.success).toBe(false);
  });
});
