import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';
import { NextFunction, Request, Response } from 'express';
import { env } from '../config/env';
import { TooManyRequestsError } from '../utils/errors';

// REST-based (no persistent TCP connection) — unlike express-rate-limit's
// default in-memory store or a raw ioredis client, this survives Vercel's
// serverless model, where each invocation can land on a different,
// short-lived function instance with nothing shared in process memory. See
// README "Security Hardening (Post-Audit)".
const redis = new Redis({
  url: env.UPSTASH_REDIS_REST_URL,
  token: env.UPSTASH_REDIS_REST_TOKEN,
});

export interface RateLimitPolicy {
  /** Window length in milliseconds — reuse the route's existing *_WINDOW_MS constant. */
  windowMs: number;
  /** Max attempts per window — reuse the route's existing *_MAX_ATTEMPTS constant. */
  maxAttempts: number;
  /** Redis key prefix for this policy, so different routes don't share a budget. */
  prefix: string;
  /** Message passed to TooManyRequestsError when the limit is exceeded. */
  message: string;
}

// Same keying strategy as the express-rate-limit middleware this replaces:
// per-IP only, not per-IP-plus-email. See README "Security Hardening
// (Post-Audit)" for the documented tradeoff and the deliberate reasons for
// not doing more here yet.
function keyFromRequest(req: Request): string {
  return req.ip ?? req.socket.remoteAddress ?? 'unknown';
}

// Builds Express middleware backed by an Upstash sliding-window limiter.
// Rejections go through the same TooManyRequestsError -> centralized
// errorHandler path as before, so the { success, error } response envelope
// is unchanged by this migration.
export function createRateLimitMiddleware(policy: RateLimitPolicy) {
  const ratelimit = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(policy.maxAttempts, `${policy.windowMs} ms`),
    prefix: policy.prefix,
  });

  return async function rateLimitMiddleware(req: Request, _res: Response, next: NextFunction): Promise<void> {
    try {
      const { success } = await ratelimit.limit(keyFromRequest(req));
      if (!success) {
        next(new TooManyRequestsError(policy.message));
        return;
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}
