import { createRateLimitMiddleware } from '../../lib/rateLimiter';

export const LOGIN_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
export const LOGIN_RATE_LIMIT_MAX_ATTEMPTS = 10; // per IP, per window

// Keyed by IP only — a deliberate, simpler starting point for an internal
// factory tool with a small, known user base, not a public consumer app. See
// README "Security Hardening (Post-Audit)" for the tradeoff this accepts:
// many users behind the same office/NAT IP share one budget, and an attacker
// spraying failed attempts against one victim's email from many different
// IPs isn't slowed by this alone. If the user base or exposure grows, a
// combined IP+email key or a per-account lockout is the natural next step.
//
// Backed by Upstash Redis (src/lib/rateLimiter.ts) rather than an in-memory
// store, since this runs on Vercel's serverless model where in-memory state
// isn't shared across function invocations.
export const loginRateLimiter = createRateLimitMiddleware({
  windowMs: LOGIN_RATE_LIMIT_WINDOW_MS,
  maxAttempts: LOGIN_RATE_LIMIT_MAX_ATTEMPTS,
  prefix: 'ratelimit:login',
  message: 'Too many login attempts. Please try again later.',
});
