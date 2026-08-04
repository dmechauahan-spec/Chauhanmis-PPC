import { describe, it, expect } from 'vitest';
import jwt from 'jsonwebtoken';
import { env } from '../../config/env';
import { JWT_ALGORITHM } from '../../config/jwt';
import { generateCaptcha, verifyCaptcha } from './captcha';

describe('generateCaptcha', () => {
  it('produces a question matching "N + M = ?" or "N - M = ?" and a JWT captchaToken', () => {
    const { question, captchaToken } = generateCaptcha();
    expect(question).toMatch(/^\d+ [+-] \d+ = \?$/);
    expect(typeof captchaToken).toBe('string');
    expect(captchaToken.split('.')).toHaveLength(3); // header.payload.signature
  });

  it('never produces a negative subtraction answer', () => {
    // Run enough times to exercise both the + and - branches.
    for (let i = 0; i < 50; i++) {
      const { question } = generateCaptcha();
      const [a, op, b] = question.split(' ');
      if (op === '-') {
        expect(Number(a)).toBeGreaterThanOrEqual(Number(b));
      }
    }
  });
});

describe('verifyCaptcha', () => {
  it('accepts the correct answer for a freshly generated challenge', () => {
    const { question, captchaToken } = generateCaptcha();
    const [a, op, b] = question.split(' ');
    const answer = op === '+' ? Number(a) + Number(b) : Number(a) - Number(b);
    expect(verifyCaptcha(captchaToken, answer)).toBe(true);
  });

  it('rejects a wrong answer', () => {
    const { question, captchaToken } = generateCaptcha();
    const [a, op, b] = question.split(' ');
    const correctAnswer = op === '+' ? Number(a) + Number(b) : Number(a) - Number(b);
    expect(verifyCaptcha(captchaToken, correctAnswer + 1)).toBe(false);
  });

  it('rejects an expired token', () => {
    // Hand-crafted with the same secret/algorithm/payload shape as
    // captcha.ts's own generateCaptcha, but already-expired — expiresIn
    // accepts a negative duration to produce a token whose exp is already
    // in the past, no fake timers needed.
    const expiredToken = jwt.sign({ purpose: 'captcha', answer: 7 }, env.JWT_SECRET, {
      expiresIn: '-1s',
      algorithm: JWT_ALGORITHM,
    });
    expect(verifyCaptcha(expiredToken, 7)).toBe(false);
  });

  it('rejects a malformed/garbage token', () => {
    expect(verifyCaptcha('not-a-real-token', 7)).toBe(false);
  });

  it('rejects a well-formed token for a different purpose (defense in depth against token confusion)', () => {
    const otherToken = jwt.sign({ purpose: 'not-captcha', answer: 7 }, env.JWT_SECRET, {
      expiresIn: '5m',
      algorithm: JWT_ALGORITHM,
    });
    expect(verifyCaptcha(otherToken, 7)).toBe(false);
  });
});
