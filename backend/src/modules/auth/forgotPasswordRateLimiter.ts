import { rateLimit } from 'express-rate-limit';
import { TooManyRequestsError } from '../../utils/errors';

// Same rationale and same numbers as loginRateLimiter.ts — this endpoint is
// exactly the kind of thing brute-force protection exists for (guessing a
// security answer, or spraying CAPTCHA/email combinations), and per-IP-only
// is the same accepted starting-point tradeoff documented in README
// "Security Hardening (Post-Audit)" for login.
export const FORGOT_PASSWORD_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
export const FORGOT_PASSWORD_RATE_LIMIT_MAX_ATTEMPTS = 10; // per IP, per window

export const forgotPasswordRateLimiter = rateLimit({
  windowMs: FORGOT_PASSWORD_RATE_LIMIT_WINDOW_MS,
  limit: FORGOT_PASSWORD_RATE_LIMIT_MAX_ATTEMPTS,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, _res, next) => {
    next(new TooManyRequestsError('Too many password reset attempts. Please try again later.'));
  },
});
