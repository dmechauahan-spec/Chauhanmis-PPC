import { describe, it, expect, afterAll } from 'vitest';
import request from 'supertest';
import { UserRole } from '@prisma/client';
import { buildTestApp } from '../../testUtils/buildTestApp';
import { prisma } from '../../db/client';
import { createTestUser, TestUser, TEST_SECURITY_ANSWER } from '../../testUtils/auth';
import authRouter from './auth.routes';
import { FORGOT_PASSWORD_RATE_LIMIT_MAX_ATTEMPTS } from './forgotPasswordRateLimiter';

// A dedicated file, same reasoning as loginRateLimit.test.ts: its own module
// registry gives this suite its own FakeRatelimit in-memory counter (see
// testUtils/setupEnv.ts, mocked globally for the whole suite), isolated from
// auth.forgotPassword.test.ts's functional traffic against the same route.
const app = buildTestApp('/api/auth', authRouter);

let user: TestUser;
const createdUserIds: bigint[] = [];

afterAll(async () => {
  await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
});

async function getSolvedCaptcha(): Promise<{ captchaToken: string; captchaAnswer: number }> {
  const res = await request(app).get('/api/auth/captcha');
  const [a, op, b] = res.body.data.question.split(' ');
  const captchaAnswer = op === '+' ? Number(a) + Number(b) : Number(a) - Number(b);
  return { captchaToken: res.body.data.captchaToken, captchaAnswer };
}

describe('POST /api/auth/forgot-password/verify rate limiting', () => {
  it(
    'allows a legitimate verify under the limit, then returns 429 (via the standard error envelope) ' +
      'once FORGOT_PASSWORD_RATE_LIMIT_MAX_ATTEMPTS is exceeded within the window',
    async () => {
      user = await createTestUser(UserRole.ProductionManager, 'Forgot Pw Rate Limit Test');
      createdUserIds.push(user.id);

      const first = await getSolvedCaptcha();
      const firstRes = await request(app).post('/api/auth/forgot-password/verify').send({
        email: user.email,
        captchaToken: first.captchaToken,
        captchaAnswer: first.captchaAnswer,
        securityAnswer: TEST_SECURITY_ANSWER,
      });
      expect(firstRes.status).toBe(200);

      // Consume the rest of the window's budget — a wrong security answer
      // is a fine way to fill it without needing more real users, same
      // pattern as loginRateLimit.test.ts uses a wrong password for.
      for (let i = 0; i < FORGOT_PASSWORD_RATE_LIMIT_MAX_ATTEMPTS - 1; i++) {
        const solved = await getSolvedCaptcha();
        const res = await request(app).post('/api/auth/forgot-password/verify').send({
          email: user.email,
          captchaToken: solved.captchaToken,
          captchaAnswer: solved.captchaAnswer,
          securityAnswer: 'wrong-answer',
        });
        expect(res.status).toBe(401);
      }

      const limited = await request(app).post('/api/auth/forgot-password/verify').send({
        email: user.email,
        captchaToken: 'irrelevant-by-now',
        captchaAnswer: 0,
        securityAnswer: 'wrong-answer',
      });
      expect(limited.status).toBe(429);
      expect(limited.body).toEqual({
        success: false,
        error: { message: expect.any(String) },
      });
    },
  );
});
