import 'dotenv/config';
import { vi } from 'vitest';

// Tests run against DATABASE_URL_TEST when provided, so the suite never
// touches the dev/prod database. See README "Test strategy".
if (process.env.DATABASE_URL_TEST) {
  process.env.DATABASE_URL = process.env.DATABASE_URL_TEST;
}

// Applies to every test file (unit and integration alike): mocks
// @upstash/ratelimit's sliding-window algorithm with a simple in-memory
// counter instead of making real network calls to Upstash during the test
// suite. Doing this once, globally, rather than per rate-limit test file,
// matters beyond just avoiding slow/flaky network calls — without it, every
// functional test file that exercises POST /api/auth/login or
// /forgot-password/verify (auth.test.ts, auth.forgotPassword.test.ts,
// auth.passwordReset.test.ts) would consume real budget against the same
// real Upstash IP-keyed counter, which persists server-side across test
// runs (unlike the old express-rate-limit in-memory store, which reset on
// every process start) — repeated local/CI runs within the same 15-minute
// window could accumulate enough real requests to start tripping 429s on
// unrelated functional tests. Vitest gives each test file its own module
// registry by default, so the FakeRatelimit instance (and its counts Map)
// constructed inside each rate-limited route module is still isolated
// per file, same isolation property the in-memory store gave for free.
vi.mock('@upstash/ratelimit', () => {
  class FakeRatelimit {
    private counts = new Map<string, number>();
    private readonly maxAttempts: number;

    constructor(config: { limiter: { tokens: number } }) {
      this.maxAttempts = config.limiter.tokens;
    }

    static slidingWindow(tokens: number) {
      return { tokens };
    }

    async limit(identifier: string) {
      const count = (this.counts.get(identifier) ?? 0) + 1;
      this.counts.set(identifier, count);
      return { success: count <= this.maxAttempts };
    }
  }
  return { Ratelimit: FakeRatelimit };
});
