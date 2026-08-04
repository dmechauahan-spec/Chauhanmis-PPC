import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { UserRole } from '@prisma/client';
import { buildTestApp } from '../../testUtils/buildTestApp';
import { prisma } from '../../db/client';
import { createTestUser, TEST_SECURITY_ANSWER, loginAs } from '../../testUtils/auth';
import { SECURITY_QUESTIONS } from './securityQuestion';
import authRouter from './auth.routes';

// A dedicated file (rather than folded into auth.test.ts), same reasoning as
// loginRateLimit.test.ts's own file: this suite's own module registry gives
// it its own forgotPasswordRateLimiter in-memory budget, isolated from every
// other test file's traffic against the same route. This file covers
// GET /captcha and POST /forgot-password/verify's identity-check behavior;
// see auth.passwordReset.test.ts for the reset-token-consumption half of the
// flow — split into two files so neither one's legitimate call count risks
// tripping its own rate limiter (see README "Self-Service Password Reset").
const app = buildTestApp('/api/auth', authRouter);

const createdUserIds: bigint[] = [];

// Created ONCE for the whole file (same convention as auth.test.ts) rather
// than per-test, so every test in this file shares one login() call against
// the budget instead of each burning one of its own.
let adminHeader: { Authorization: string };

beforeAll(async () => {
  const admin = await createTestUser(UserRole.Admin, 'Forgot Pw Test Admin');
  createdUserIds.push(admin.id);
  adminHeader = await loginAs(admin);
});

afterAll(async () => {
  await prisma.passwordResetToken.deleteMany({ where: { userId: { in: createdUserIds } } });
  await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
});

/** GET a fresh CAPTCHA and compute the correct answer by parsing its own question string. */
async function getSolvedCaptcha(): Promise<{ captchaToken: string; captchaAnswer: number }> {
  const res = await request(app).get('/api/auth/captcha');
  const [a, op, b] = res.body.data.question.split(' ');
  const captchaAnswer = op === '+' ? Number(a) + Number(b) : Number(a) - Number(b);
  return { captchaToken: res.body.data.captchaToken, captchaAnswer };
}

async function createUserWithSecurityQA(overrides: Record<string, unknown> = {}) {
  const res = await request(app)
    .post('/api/auth/users')
    .set(adminHeader)
    .send({
      email: `forgot-pw-test-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`,
      password: 'Original-Password-123!',
      name: 'Forgot Password Test User',
      role: 'ProductionManager',
      securityQuestion: SECURITY_QUESTIONS[0],
      securityAnswer: TEST_SECURITY_ANSWER,
      ...overrides,
    });
  expect(res.status).toBe(201);
  createdUserIds.push(BigInt(res.body.data.id));
  return res.body.data as { id: string; email: string };
}

describe('GET /api/auth/captcha', () => {
  it('returns a question and a captchaToken', async () => {
    const res = await request(app).get('/api/auth/captcha');
    expect(res.status).toBe(200);
    expect(res.body.data.question).toMatch(/^\d+ [+-] \d+ = \?$/);
    expect(typeof res.body.data.captchaToken).toBe('string');
  });
});

describe('POST /api/auth/forgot-password/verify — generic-failure behavior', () => {
  it('rejects a wrong security answer and an unknown email with the exact same generic message', async () => {
    const user = await createUserWithSecurityQA();

    const solved1 = await getSolvedCaptcha();
    const wrongAnswer = await request(app).post('/api/auth/forgot-password/verify').send({
      email: user.email,
      captchaToken: solved1.captchaToken,
      captchaAnswer: solved1.captchaAnswer,
      securityAnswer: 'definitely wrong',
    });

    const solved2 = await getSolvedCaptcha();
    const unknownEmail = await request(app).post('/api/auth/forgot-password/verify').send({
      email: 'nobody-forgot-pw-test@example.com',
      captchaToken: solved2.captchaToken,
      captchaAnswer: solved2.captchaAnswer,
      securityAnswer: 'whatever',
    });

    expect(wrongAnswer.status).toBe(401);
    expect(unknownEmail.status).toBe(401);
    expect(wrongAnswer.body.error.message).toBe(unknownEmail.body.error.message);
    expect(wrongAnswer.body.data).toBeUndefined();
  });

  it('accepts the answer case/whitespace-insensitively (normalization)', async () => {
    const user = await createUserWithSecurityQA();

    const { captchaToken, captchaAnswer } = await getSolvedCaptcha();
    const res = await request(app).post('/api/auth/forgot-password/verify').send({
      email: user.email,
      captchaToken,
      captchaAnswer,
      securityAnswer: `  ${TEST_SECURITY_ANSWER.toUpperCase()}  `,
    });
    expect(res.status).toBe(200);
  });

  it('rejects a wrong CAPTCHA answer', async () => {
    const user = await createUserWithSecurityQA();

    const { captchaToken, captchaAnswer } = await getSolvedCaptcha();
    const res = await request(app)
      .post('/api/auth/forgot-password/verify')
      .send({ email: user.email, captchaToken, captchaAnswer: captchaAnswer + 1, securityAnswer: TEST_SECURITY_ANSWER });
    expect(res.status).toBe(401);
  });

  it('rejects a malformed body with 400', async () => {
    const res = await request(app).post('/api/auth/forgot-password/verify').send({ email: 'not-an-email' });
    expect(res.status).toBe(400);
  });

  it('rejects a legacy account (security question not yet configured) with a distinct, actionable error', async () => {
    const legacy = await createTestUser(UserRole.ProductionManager, 'Forgot Pw Legacy');
    createdUserIds.push(legacy.id);
    await prisma.user.update({
      where: { id: legacy.id },
      data: { securityQuestion: 'NOT_SET', securityAnswerHash: 'NOT_SET' },
    });

    const { captchaToken, captchaAnswer } = await getSolvedCaptcha();
    const res = await request(app)
      .post('/api/auth/forgot-password/verify')
      .send({ email: legacy.email, captchaToken, captchaAnswer, securityAnswer: 'anything' });

    expect(res.status).toBe(409);
    expect(res.body.error.message).toMatch(/ask an admin/i);
  });
});
