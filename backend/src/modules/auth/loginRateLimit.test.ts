import { describe, it, expect, afterAll } from 'vitest';
import request from 'supertest';
import { UserRole } from '@prisma/client';
import { buildTestApp } from '../../testUtils/buildTestApp';
import { prisma } from '../../db/client';
import { createTestUser, TestUser } from '../../testUtils/auth';
import authRouter from './auth.routes';
import { LOGIN_RATE_LIMIT_MAX_ATTEMPTS } from './loginRateLimiter';

// A dedicated file (rather than folded into auth.test.ts) so this suite's
// own module registry — and therefore its own FakeRatelimit in-memory
// counter (see testUtils/setupEnv.ts, mocked globally for the whole suite)
// — is isolated from every other test file's login traffic. See README
// "Security Hardening (Post-Audit)".
const app = buildTestApp('/api/auth', authRouter);
const TEST_PASSWORD = 'Test-Password-123!';

let user: TestUser;
const createdUserIds: bigint[] = [];

afterAll(async () => {
  await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
});

describe('POST /api/auth/login rate limiting', () => {
  it(
    'allows a legitimate login under the limit, then returns 429 (via the standard error envelope) ' +
      'once LOGIN_RATE_LIMIT_MAX_ATTEMPTS is exceeded within the window',
    async () => {
      user = await createTestUser(UserRole.ProductionManager, 'Rate Limit Test');
      createdUserIds.push(user.id);

      // First request: a genuine login, well under the limit — succeeds normally.
      const first = await request(app)
        .post('/api/auth/login')
        .send({ email: user.email, password: TEST_PASSWORD });
      expect(first.status).toBe(200);

      // Consume the rest of the window's budget. The limiter counts every
      // request to the route by default, not just failed ones, so a wrong
      // password is a fine way to fill the remaining budget without needing
      // more real users.
      for (let i = 0; i < LOGIN_RATE_LIMIT_MAX_ATTEMPTS - 1; i++) {
        const res = await request(app)
          .post('/api/auth/login')
          .send({ email: user.email, password: 'wrong-password' });
        expect(res.status).toBe(401);
      }

      // Budget now exhausted — the next request is rejected by the limiter
      // itself (never reaches auth logic), through the same { success,
      // error } envelope every other error in this API uses.
      const limited = await request(app)
        .post('/api/auth/login')
        .send({ email: user.email, password: 'wrong-password' });
      expect(limited.status).toBe(429);
      expect(limited.body).toEqual({
        success: false,
        error: { message: expect.any(String) },
      });
    },
  );
});
