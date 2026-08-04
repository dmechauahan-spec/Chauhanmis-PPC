import type { CorsOptions } from 'cors';
import { env } from './env';
import { logger } from '../middleware/requestLogger';

const LOCALHOST_ORIGIN_PATTERN = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

function parseAllowedOrigins(raw: string | undefined): string[] {
  return (raw ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
}

// CORS_ALLOWED_ORIGINS is the explicit allowlist — see README "Security
// Hardening (Post-Audit)" and .env.example. Nothing in this codebase guesses
// at the real frontend's deployed origin ahead of time, so the behavior is
// entirely env-driven:
// - Set: only those exact origins are allowed, in every environment.
// - Unset, NODE_ENV !== 'production': falls back to allowing any
//   http(s)://localhost[:port] / 127.0.0.1[:port] origin, so a local
//   frontend dev server (Vite, CRA, ...) on whatever port works with zero
//   config.
// - Unset, NODE_ENV === 'production': no origin is allowed. CORS is a
//   browser-enforced mechanism, so this only affects browser-based
//   cross-origin callers — it rejects those outright rather than silently
//   wildcarding or silently carrying the dev-only localhost allowance into
//   production.
export function buildCorsOptions(): CorsOptions {
  const allowedOrigins = parseAllowedOrigins(env.CORS_ALLOWED_ORIGINS);

  if (allowedOrigins.length > 0) {
    return { origin: allowedOrigins };
  }

  if (env.NODE_ENV !== 'production') {
    return { origin: LOCALHOST_ORIGIN_PATTERN };
  }

  logger.warn(
    "CORS_ALLOWED_ORIGINS is not set in production — all cross-origin browser requests will be rejected. " +
      "Set it to your frontend's deployed origin(s) once the frontend exists.",
  );
  return { origin: false };
}
