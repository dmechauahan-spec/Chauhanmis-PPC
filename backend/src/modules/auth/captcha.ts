import jwt from 'jsonwebtoken';
import { env } from '../../config/env';
import { JWT_ALGORITHM } from '../../config/jwt';

// A basic, self-hosted bot-deterrent — NOT a true human-verification
// CAPTCHA. A trivial script can solve simple arithmetic; this only stops
// naive automated abuse, same spirit as the login rate limiter. See README
// "Self-Service Password Reset" for the documented upgrade path (real
// reCAPTCHA/hCaptcha, which requires the org's own API keys — not set up
// here). Paired with the security-question check for actual identity proof.
export const CAPTCHA_TOKEN_EXPIRY = '5m';

// Reuses JWT_SECRET rather than introducing a second dedicated secret — the
// token is short-lived, self-contained (no DB table), and signed/verified
// with the same explicit JWT_ALGORITHM pin as every other token in this API;
// a separate secret would add an extra required env var for no real security
// gain here, since the payload is just an arithmetic answer, not anything
// sensitive on its own.
const CAPTCHA_TOKEN_PURPOSE = 'captcha';

interface CaptchaPayload {
  purpose: typeof CAPTCHA_TOKEN_PURPOSE;
  answer: number;
}

export interface CaptchaChallenge {
  question: string;
  captchaToken: string;
}

// Addition or subtraction of two numbers 1–20; subtraction always orders the
// larger operand first so the answer is never negative (avoids a confusing
// "-3" answer field for a simple bot-deterrent).
export function generateCaptcha(): CaptchaChallenge {
  const a = Math.floor(Math.random() * 20) + 1;
  const b = Math.floor(Math.random() * 20) + 1;
  const useSubtraction = Math.random() < 0.5;

  let question: string;
  let answer: number;
  if (useSubtraction) {
    const [hi, lo] = a >= b ? [a, b] : [b, a];
    question = `${hi} - ${lo} = ?`;
    answer = hi - lo;
  } else {
    question = `${a} + ${b} = ?`;
    answer = a + b;
  }

  const payload: CaptchaPayload = { purpose: CAPTCHA_TOKEN_PURPOSE, answer };
  const captchaToken = jwt.sign(payload, env.JWT_SECRET, {
    expiresIn: CAPTCHA_TOKEN_EXPIRY,
    algorithm: JWT_ALGORITHM,
  });

  return { question, captchaToken };
}

// Never throws — an expired, malformed, or tampered token is simply "not a
// match", same as a wrong answer, so callers get one uniform failure path.
export function verifyCaptcha(captchaToken: string, captchaAnswer: number): boolean {
  try {
    const decoded = jwt.verify(captchaToken, env.JWT_SECRET, { algorithms: [JWT_ALGORITHM] });
    if (typeof decoded !== 'object' || decoded === null) return false;
    const payload = decoded as Partial<CaptchaPayload>;
    return payload.purpose === CAPTCHA_TOKEN_PURPOSE && payload.answer === captchaAnswer;
  } catch {
    return false;
  }
}
