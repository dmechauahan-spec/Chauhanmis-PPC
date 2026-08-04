import 'dotenv/config';
import { z } from 'zod';

// Exported (in addition to the parsed/validated `env` below) so tests can
// exercise the validation rules directly — e.g. confirming a short
// JWT_SECRET is rejected — without needing to re-run this module's top-level
// process.env parsing under a different environment.
export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  DATABASE_URL_TEST: z.string().optional(),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  // Authentication & Authorization — see README. JWT_SECRET signs/verifies
  // access tokens; never committed, generate a real one locally. 32 chars
  // gives an HMAC-SHA256 secret reasonable entropy (matches the 256-bit key
  // size HS256 is designed around) — short enough to type, long enough that
  // a trivial/default value can't accidentally pass. See README "Security
  // Hardening (Post-Audit)".
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  // Bootstrap-only: prisma/seed.ts creates the first Admin user from these.
  // Change this password after first login — see README.
  ADMIN_SEED_EMAIL: z.string().email().optional(),
  ADMIN_SEED_PASSWORD: z.string().min(1).optional(),
  // Bootstrap-only, same as above: the seeded Admin's self-service
  // password-reset security question/answer — see README "Self-Service
  // Password Reset". prisma/seed.ts fails loudly (not just a warning) if
  // these are missing whenever ADMIN_SEED_EMAIL/PASSWORD are present, since
  // the User model requires a real security question for every user.
  ADMIN_SEED_SECURITY_QUESTION: z.string().min(1).optional(),
  ADMIN_SEED_SECURITY_ANSWER: z.string().min(1).optional(),
  // Comma-separated list of allowed CORS origins — see src/config/cors.ts
  // and README "Security Hardening (Post-Audit)" for the fallback behavior
  // when this is unset.
  CORS_ALLOWED_ORIGINS: z.string().optional(),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  // eslint-disable-next-line no-console
  console.error('Invalid environment variables:', parsed.error.flatten().fieldErrors);
  throw new Error('Invalid environment variables. Check .env against .env.example.');
}

export const env = parsed.data;
