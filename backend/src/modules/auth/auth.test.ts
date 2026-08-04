import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { UserRole } from '@prisma/client';
import { buildTestApp } from '../../testUtils/buildTestApp';
import { prisma } from '../../db/client';
import { env } from '../../config/env';
import { TestUser, createTestUser, loginAs } from '../../testUtils/auth';
import { SECURITY_QUESTIONS } from './securityQuestion';
import authRouter from './auth.routes';

const app = buildTestApp('/api/auth', authRouter);
const TEST_PASSWORD = 'Test-Password-123!';

// Every POST /api/auth/users body in this file needs these two fields now
// that they're required — a small helper keeps each test's payload focused
// on what it's actually asserting about.
function newUserPayload(overrides: Record<string, unknown> = {}) {
  return {
    securityQuestion: SECURITY_QUESTIONS[0],
    securityAnswer: 'Test Answer',
    ...overrides,
  };
}

let adminUser: TestUser;
let adminHeader: { Authorization: string };
let storeManagerUser: TestUser;
let storeManagerHeader: { Authorization: string };
const createdUserIds: bigint[] = [];

beforeAll(async () => {
  adminUser = await createTestUser(UserRole.Admin, 'Auth Test Admin');
  createdUserIds.push(adminUser.id);
  adminHeader = await loginAs(adminUser);

  storeManagerUser = await createTestUser(UserRole.StoreManager, 'Auth Test SM');
  createdUserIds.push(storeManagerUser.id);
  storeManagerHeader = await loginAs(storeManagerUser);
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  await prisma.$disconnect();
});

describe('POST /api/auth/login', () => {
  it('logs in successfully and never returns passwordHash', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: adminUser.email, password: TEST_PASSWORD });
    expect(res.status).toBe(200);
    expect(res.body.data.token).toBeTruthy();
    expect(res.body.data.user.email).toBe(adminUser.email);
    expect(res.body.data.user.role).toBe('Admin');
    expect(res.body.data.user.passwordHash).toBeUndefined();
  });

  it('rejects a wrong password and an unknown email with the exact same generic 401 message', async () => {
    const wrongPassword = await request(app)
      .post('/api/auth/login')
      .send({ email: adminUser.email, password: 'wrong-password' });
    const unknownEmail = await request(app)
      .post('/api/auth/login')
      .send({ email: 'nobody@example.com', password: 'whatever123' });

    expect(wrongPassword.status).toBe(401);
    expect(unknownEmail.status).toBe(401);
    // Identical message either way — doesn't reveal which part was wrong.
    expect(wrongPassword.body.error.message).toBe(unknownEmail.body.error.message);
  });

  it('rejects a deactivated user with 403', async () => {
    const inactiveUser = await createTestUser(UserRole.ProductionManager, 'Auth Test Inactive');
    createdUserIds.push(inactiveUser.id);
    await prisma.user.update({ where: { id: inactiveUser.id }, data: { isActive: false } });

    const res = await request(app).post('/api/auth/login').send({ email: inactiveUser.email, password: TEST_PASSWORD });
    expect(res.status).toBe(403);
  });

  it('rejects a malformed body', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: 'not-an-email' });
    expect(res.status).toBe(400);
  });
});

describe('GET /api/auth/me', () => {
  it('returns the current user from a valid token', async () => {
    const res = await request(app).get('/api/auth/me').set(adminHeader);
    expect(res.status).toBe(200);
    expect(res.body.data.email).toBe(adminUser.email);
    expect(res.body.data.passwordHash).toBeUndefined();
  });

  it('returns 401 with no token', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });

  it('returns 401 with a garbage token', async () => {
    const res = await request(app).get('/api/auth/me').set({ Authorization: 'Bearer not-a-real-token' });
    expect(res.status).toBe(401);
  });

  // JWT_ALGORITHM is pinned to HS256 on both sign and verify (see README
  // "Security Hardening (Post-Audit)") — this proves the verify side of that
  // pin actually rejects a token that is correctly signed with the right
  // secret but the wrong algorithm, not just a malformed/garbage one.
  it('returns 401 for a token signed with a different algorithm, even with the correct secret', async () => {
    const wrongAlgToken = jwt.sign({ sub: adminUser.id.toString() }, env.JWT_SECRET, {
      algorithm: 'HS384',
      expiresIn: '8h',
    });
    const res = await request(app).get('/api/auth/me').set({ Authorization: `Bearer ${wrongAlgToken}` });
    expect(res.status).toBe(401);
  });
});

describe('POST /api/auth/users — Admin only', () => {
  it('allows an Admin to create a user', async () => {
    const res = await request(app)
      .post('/api/auth/users')
      .set(adminHeader)
      .send(
        newUserPayload({
          email: `auth-test-new-${Date.now()}@example.com`,
          password: 'a-long-enough-password',
          name: 'New Guy',
          role: 'ProductionManager',
        }),
      );
    expect(res.status).toBe(201);
    expect(res.body.data.passwordHash).toBeUndefined();
    expect(res.body.data.securityAnswerHash).toBeUndefined();
    createdUserIds.push(BigInt(res.body.data.id));
  });

  it('rejects a non-Admin with 403', async () => {
    const res = await request(app)
      .post('/api/auth/users')
      .set(storeManagerHeader)
      .send(
        newUserPayload({
          email: `auth-test-forbidden-${Date.now()}@example.com`,
          password: 'a-long-enough-password',
          name: 'Nope',
          role: 'StoreManager',
        }),
      );
    expect(res.status).toBe(403);
  });

  it('rejects an unauthenticated request with 401', async () => {
    const res = await request(app)
      .post('/api/auth/users')
      .send(
        newUserPayload({
          email: `auth-test-noauth-${Date.now()}@example.com`,
          password: 'a-long-enough-password',
          name: 'Nope',
          role: 'StoreManager',
        }),
      );
    expect(res.status).toBe(401);
  });

  it('rejects a duplicate email with 409', async () => {
    const res = await request(app)
      .post('/api/auth/users')
      .set(adminHeader)
      .send(newUserPayload({ email: adminUser.email, password: 'a-long-enough-password', name: 'Duplicate', role: 'StoreManager' }));
    expect(res.status).toBe(409);
  });

  it('rejects a password shorter than the minimum length', async () => {
    const res = await request(app)
      .post('/api/auth/users')
      .set(adminHeader)
      .send(
        newUserPayload({
          email: `auth-test-short-${Date.now()}@example.com`,
          password: 'short',
          name: 'Short Pw',
          role: 'StoreManager',
        }),
      );
    expect(res.status).toBe(400);
  });

  it('rejects a security question not in the fixed list', async () => {
    const res = await request(app)
      .post('/api/auth/users')
      .set(adminHeader)
      .send(
        newUserPayload({
          email: `auth-test-badquestion-${Date.now()}@example.com`,
          password: 'a-long-enough-password',
          name: 'Bad Question',
          role: 'StoreManager',
          securityQuestion: 'What is your favorite color?',
        }),
      );
    expect(res.status).toBe(400);
  });

  it('rejects a missing securityAnswer', async () => {
    const res = await request(app)
      .post('/api/auth/users')
      .set(adminHeader)
      .send({
        email: `auth-test-noanswer-${Date.now()}@example.com`,
        password: 'a-long-enough-password',
        name: 'No Answer',
        role: 'StoreManager',
        securityQuestion: SECURITY_QUESTIONS[0],
      });
    expect(res.status).toBe(400);
  });
});

describe('GET /api/auth/users — Admin only', () => {
  it('lists users without ever including passwordHash', async () => {
    const res = await request(app).get('/api/auth/users').set(adminHeader).query({ pageSize: 100 });
    expect(res.status).toBe(200);
    expect(res.body.data.items.length).toBeGreaterThan(0);
    expect(res.body.data.items.every((u: Record<string, unknown>) => u.passwordHash === undefined)).toBe(true);
  });

  it('rejects a non-Admin with 403', async () => {
    const res = await request(app).get('/api/auth/users').set(storeManagerHeader);
    expect(res.status).toBe(403);
  });
});

describe('PATCH /api/auth/users/:userId — Admin only', () => {
  it('deactivates a user', async () => {
    const target = await createTestUser(UserRole.ProductionManager, 'Auth Test Target');
    createdUserIds.push(target.id);

    const res = await request(app).patch(`/api/auth/users/${target.id}`).set(adminHeader).send({ isActive: false });
    expect(res.status).toBe(200);
    expect(res.body.data.isActive).toBe(false);
  });

  it('rejects a non-Admin with 403', async () => {
    const res = await request(app).patch(`/api/auth/users/${storeManagerUser.id}`).set(storeManagerHeader).send({ name: 'Hacked' });
    expect(res.status).toBe(403);
  });

  it('rejects an empty body with 400', async () => {
    const res = await request(app).patch(`/api/auth/users/${storeManagerUser.id}`).set(adminHeader).send({});
    expect(res.status).toBe(400);
  });

  it('returns 404 for an unknown userId', async () => {
    const res = await request(app).patch('/api/auth/users/999999999').set(adminHeader).send({ name: 'X' });
    expect(res.status).toBe(404);
  });

  it('rejects securityQuestion without a securityAnswer (must be provided together)', async () => {
    const res = await request(app)
      .patch(`/api/auth/users/${storeManagerUser.id}`)
      .set(adminHeader)
      .send({ securityQuestion: SECURITY_QUESTIONS[1] });
    expect(res.status).toBe(400);
  });

  it('rejects securityAnswer without a securityQuestion (must be provided together)', async () => {
    const res = await request(app)
      .patch(`/api/auth/users/${storeManagerUser.id}`)
      .set(adminHeader)
      .send({ securityAnswer: 'Some Answer' });
    expect(res.status).toBe(400);
  });

  it("lets an Admin fix a legacy account's security question via update, unblocking forgot-password for it", async () => {
    const legacy = await createTestUser(UserRole.ProductionManager, 'Auth Test Legacy');
    createdUserIds.push(legacy.id);
    await prisma.user.update({
      where: { id: legacy.id },
      data: { securityQuestion: 'NOT_SET', securityAnswerHash: 'NOT_SET' },
    });

    const updateRes = await request(app)
      .patch(`/api/auth/users/${legacy.id}`)
      .set(adminHeader)
      .send({ securityQuestion: SECURITY_QUESTIONS[2], securityAnswer: 'Fixed Answer' });
    expect(updateRes.status).toBe(200);

    const captchaRes = await request(app).get('/api/auth/captcha');
    const [a, op, b] = captchaRes.body.data.question.split(' ');
    const captchaAnswer = op === '+' ? Number(a) + Number(b) : Number(a) - Number(b);

    const verifyRes = await request(app).post('/api/auth/forgot-password/verify').send({
      email: legacy.email,
      captchaToken: captchaRes.body.data.captchaToken,
      captchaAnswer,
      securityAnswer: 'Fixed Answer',
    });
    expect(verifyRes.status).toBe(200);
    expect(verifyRes.body.data.resetToken).toBeTruthy();
  });
});
