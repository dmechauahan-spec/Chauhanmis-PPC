import { describe, it, expect } from 'vitest';
import {
  SECURITY_QUESTIONS,
  SECURITY_QUESTION_NOT_SET,
  normalizeSecurityAnswer,
  securityQuestionEnum,
} from './securityQuestion';

describe('normalizeSecurityAnswer', () => {
  it('trims surrounding whitespace', () => {
    expect(normalizeSecurityAnswer('  Fluffy  ')).toBe('fluffy');
  });

  it('lowercases the answer', () => {
    expect(normalizeSecurityAnswer('FLUFFY')).toBe('fluffy');
  });

  it('is idempotent — normalizing an already-normalized answer changes nothing', () => {
    const once = normalizeSecurityAnswer('  Mixed Case Answer  ');
    expect(normalizeSecurityAnswer(once)).toBe(once);
  });

  it('treats differently-cased/whitespaced input as equal after normalization', () => {
    expect(normalizeSecurityAnswer('Mumbai')).toBe(normalizeSecurityAnswer('  MUMBAI  '));
  });
});

describe('securityQuestionEnum', () => {
  it('accepts every question in SECURITY_QUESTIONS', () => {
    for (const q of SECURITY_QUESTIONS) {
      expect(securityQuestionEnum.safeParse(q).success).toBe(true);
    }
  });

  it('rejects a free-text question not in the fixed list', () => {
    expect(securityQuestionEnum.safeParse('What is your favorite color?').success).toBe(false);
  });

  it('rejects the backfill sentinel — it must never validate as real user input', () => {
    expect(securityQuestionEnum.safeParse(SECURITY_QUESTION_NOT_SET).success).toBe(false);
  });
});
