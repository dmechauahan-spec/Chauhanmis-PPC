import { describe, expect, it } from 'vitest';
import { PASSWORD_MIN_LENGTH } from '../src/modules/auth/auth.schema';
import { SECURITY_QUESTIONS } from '../src/modules/auth/securityQuestion';
import { assertAdminSeedPasswordStrength, assertAdminSeedSecurityQuestionStrength } from './seedPasswordPolicy';

describe('assertAdminSeedPasswordStrength', () => {
  it(`accepts a password at exactly the ${PASSWORD_MIN_LENGTH}-character minimum`, () => {
    expect(() => assertAdminSeedPasswordStrength('a'.repeat(PASSWORD_MIN_LENGTH))).not.toThrow();
  });

  it('rejects a password shorter than the minimum, with a clear error', () => {
    expect(() => assertAdminSeedPasswordStrength('a'.repeat(PASSWORD_MIN_LENGTH - 1))).toThrow(
      `ADMIN_SEED_PASSWORD must be at least ${PASSWORD_MIN_LENGTH} characters`,
    );
  });

  it('rejects an empty password', () => {
    expect(() => assertAdminSeedPasswordStrength('')).toThrow();
  });
});

describe('assertAdminSeedSecurityQuestionStrength', () => {
  it('accepts any question from the fixed list, with a non-blank answer', () => {
    expect(() => assertAdminSeedSecurityQuestionStrength(SECURITY_QUESTIONS[0], 'Fluffy')).not.toThrow();
  });

  it('rejects a question not in the fixed list, with a clear error', () => {
    expect(() => assertAdminSeedSecurityQuestionStrength('What is your favorite color?', 'Blue')).toThrow(
      'ADMIN_SEED_SECURITY_QUESTION must be exactly one of',
    );
  });

  it('rejects a blank answer', () => {
    expect(() => assertAdminSeedSecurityQuestionStrength(SECURITY_QUESTIONS[0], '   ')).toThrow(
      'ADMIN_SEED_SECURITY_ANSWER must not be blank',
    );
  });
});
