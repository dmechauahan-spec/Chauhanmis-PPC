import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { UserRole } from '@prisma/client';
import { buildTestApp } from '../../testUtils/buildTestApp';
import { prisma } from '../../db/client';
import { createTestUser, TEST_SECURITY_ANSWER, loginAs } from '../../testUtils/auth';
import { SECURITY_QUESTIONS } from './securityQuestion';
import authRouter from './auth.routes';

// The reset-token-consumption half of the flow — see auth.forgotPassword.test.ts
// for GET /captcha and POST /forgot-password/verify's identity-check
// behavior, and for why this is a separate file (own forgotPasswordRateLimiter
// budget). See README "Self-Service Password Reset".
const app = buildTestApp('/api/auth', authRouter);

const createdUserIds: bigint[] = [];
let adminHeader: { Authorization: string };

beforeAll(async () => {
  const admin = await createTestUser(UserRole.Admin, 'Password Reset Test Admin');
  createdUserIds.push(admin.id);
  adminHeader = await loginAs(admin);
});

afterAll(async () => {
  await prisma.passwordResetToken.deleteMany({ where: { userId: { in: createdUserIds } } });
  await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
});

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
      email: `pw-reset-test-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`,
      password: 'Original-Password-123!',
      name: 'Password Reset Test User',
      role: 'ProductionManager',
      securityQuestion: SECURITY_QUESTIONS[0],
      securityAnswer: TEST_SECURITY_ANSWER,
      ...overrides,
    });
  expect(res.status).toBe(201);
  createdUserIds.push(BigInt(res.body.data.id));
  return res.body.data as { id: string; email: string };
}

/** Runs the identity-check step and returns a fresh, valid resetToken for the given user. */
async function getResetToken(email: string): Promise<string> {
  const { captchaToken, captchaAnswer } = await getSolvedCaptcha();
  const res = await request(app)
    .post('/api/auth/forgot-password/verify')
    .send({ email, captchaToken, captchaAnswer, securityAnswer: TEST_SECURITY_ANSWER });
  expect(res.status).toBe(200);
  return res.body.data.resetToken as string;
}

describe('POST /api/auth/forgot-password/verify -> POST /api/auth/forgot-password/reset (full happy path)', () => {
  it('creates a user, verifies identity, resets the password, and the new password (not the old one) logs in', async () => {
    const user = await createUserWithSecurityQA();
    const resetToken = await getResetToken(user.email);

    const resetRes = await request(app)
      .post('/api/auth/forgot-password/reset')
      .send({ resetToken, newPassword: 'Brand-New-Password-456!' });
    expect(resetRes.status).toBe(200);

    const loginWithNew = await request(app)
      .post('/api/auth/login')
      .send({ email: user.email, password: 'Brand-New-Password-456!' });
    expect(loginWithNew.status).toBe(200);

    const loginWithOld = await request(app)
      .post('/api/auth/login')
      .send({ email: user.email, password: 'Original-Password-123!' });
    expect(loginWithOld.status).toBe(401);
  });
});

describe('POST /api/auth/forgot-password/reset — token validation', () => {
  it('rejects a malformed/garbage reset token', async () => {
    const res = await request(app)
      .post('/api/auth/forgot-password/reset')
      .send({ resetToken: 'not-a-real-token', newPassword: 'Some-Password-123!' });
    expect(res.status).toBe(401);
  });

  it('rejects reusing an already-used reset token', async () => {
    const user = await createUserWithSecurityQA();
    const resetToken = await getResetToken(user.email);

    const firstUse = await request(app)
      .post('/api/auth/forgot-password/reset')
      .send({ resetToken, newPassword: 'First-Use-Password-123!' });
    expect(firstUse.status).toBe(200);

    const secondUse = await request(app)
      .post('/api/auth/forgot-password/reset')
      .send({ resetToken, newPassword: 'Second-Use-Password-456!' });
    expect(secondUse.status).toBe(401);
  });

  it('rejects a reset token whose DB record has expired, even though the JWT itself has not', async () => {
    const user = await createUserWithSecurityQA();
    const resetToken = await getResetToken(user.email);

    // Backdate the DB row directly (the JWT's own 15-minute exp claim is
    // still valid) — proves the DB-side expiry check is what's enforcing
    // this, independent of the token's self-contained expiry.
    await prisma.passwordResetToken.updateMany({
      where: { userId: BigInt(user.id) },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    const res = await request(app)
      .post('/api/auth/forgot-password/reset')
      .send({ resetToken, newPassword: 'Some-Password-123!' });
    expect(res.status).toBe(401);
  });

  it('rejects a newPassword shorter than the minimum length', async () => {
    const user = await createUserWithSecurityQA();
    const resetToken = await getResetToken(user.email);

    const res = await request(app).post('/api/auth/forgot-password/reset').send({ resetToken, newPassword: 'short' });
    expect(res.status).toBe(400);
  });

  it('invalidates other outstanding unused reset tokens for the same user after one is used', async () => {
    const user = await createUserWithSecurityQA();
    const token1 = await getResetToken(user.email);
    const token2 = await getResetToken(user.email);

    const useToken1 = await request(app)
      .post('/api/auth/forgot-password/reset')
      .send({ resetToken: token1, newPassword: 'First-Token-Password-123!' });
    expect(useToken1.status).toBe(200);

    // token2 was issued earlier and never used, but a password reset already
    // happened via token1 in the meantime — it must no longer be usable.
    const useToken2 = await request(app)
      .post('/api/auth/forgot-password/reset')
      .send({ resetToken: token2, newPassword: 'Second-Token-Password-456!' });
    expect(useToken2.status).toBe(401);
  });
});
