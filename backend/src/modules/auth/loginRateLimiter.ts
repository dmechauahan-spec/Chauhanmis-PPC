import { rateLimit } from 'express-rate-limit';
import { TooManyRequestsError } from '../../utils/errors';

export const LOGIN_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
export const LOGIN_RATE_LIMIT_MAX_ATTEMPTS = 10; // per IP, per window

// Keyed by IP only (express-rate-limit's default keyGenerator) — a
// deliberate, simpler starting point for an internal factory tool with a
// small, known user base, not a public consumer app. See README "Security
// Hardening (Post-Audit)" for the tradeoff this accepts: many users behind
// the same office/NAT IP share one budget, and an attacker spraying failed
// attempts against one victim's email from many different IPs isn't slowed
// by this alone. If the user base or exposure grows, a combined IP+email key
// (via express-rate-limit's `ipKeyGenerator` helper) or a per-account
// lockout is the natural next step.
export const loginRateLimiter = rateLimit({
  windowMs: LOGIN_RATE_LIMIT_WINDOW_MS,
  limit: LOGIN_RATE_LIMIT_MAX_ATTEMPTS,
  standardHeaders: true,
  legacyHeaders: false,
  // Routes the rejection through the same centralized errorHandler as every
  // other error in this API, instead of express-rate-limit's own default
  // plain-text/JSON response shape.
  handler: (_req, _res, next) => {
    next(new TooManyRequestsError('Too many login attempts. Please try again later.'));
  },
});
