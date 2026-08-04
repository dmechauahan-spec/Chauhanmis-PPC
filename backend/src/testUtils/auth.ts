// Shared test helper for the auth retrofit — used by auth.test.ts itself
// and by every other module's test file once headers are added per the
// permission matrix. Named `testUtils` (not `test-utils`) to match this
// project's existing folder (see buildTestApp.ts, setupEnv.ts alongside it).
import bcrypt from 'bcrypt';
import request from 'supertest';
import { UserRole } from '@prisma/client';
import { prisma } from '../db/client';
import { buildTestApp } from './buildTestApp';
import authRouter from '../modules/auth/auth.routes';
import { SECURITY_QUESTIONS, normalizeSecurityAnswer } from '../modules/auth/securityQuestion';

const authApp = buildTestApp('/api/auth', authRouter);

// Fixed, known password for every test user — never anything sensitive,
// this only ever exists in the throwaway test database.
const TEST_PASSWORD = 'Test-Password-123!';

// Fixed, known security question/answer for every test user created via
// createTestUser — a real (non-sentinel) value, since most callers just need
// a working account for an Authorization header and have no reason to
// simulate the legacy/backfilled "security question not set" edge case.
// Tests that specifically exercise that edge case create a user with this
// sentinel directly instead (see auth.forgotPassword.test.ts).
export const TEST_SECURITY_QUESTION = SECURITY_QUESTIONS[0];
export const TEST_SECURITY_ANSWER = 'Test Security Answer';

// Low bcrypt cost factor for test users only — correctness matters here,
// not resistance to offline attack, and tests already run against a real
// network-hop Postgres instance, so shaving hashing time adds up.
const TEST_BCRYPT_COST = 4;

let counter = 0;

export interface TestUser {
  id: bigint;
  email: string;
  name: string;
  role: UserRole;
}

/** Inserts a user directly via Prisma (bypassing the API) with a known password and security answer. */
export async function createTestUser(role: UserRole, namePrefix = 'Test User'): Promise<TestUser> {
  counter += 1;
  const email = `test-auth-${role.toLowerCase()}-${Date.now()}-${counter}@example.com`;
  const passwordHash = await bcrypt.hash(TEST_PASSWORD, TEST_BCRYPT_COST);
  const securityAnswerHash = await bcrypt.hash(normalizeSecurityAnswer(TEST_SECURITY_ANSWER), TEST_BCRYPT_COST);
  const user = await prisma.user.create({
    data: {
      email,
      passwordHash,
      name: `${namePrefix} (${role} ${counter})`,
      role,
      isActive: true,
      securityQuestion: TEST_SECURITY_QUESTION,
      securityAnswerHash,
    },
  });
  return { id: user.id, email: user.email, name: user.name, role: user.role };
}

/** Logs in as a specific already-created test user via the real /api/auth/login endpoint. */
export async function loginAs(user: TestUser): Promise<{ Authorization: string }> {
  const res = await request(authApp).post('/api/auth/login').send({ email: user.email, password: TEST_PASSWORD });
  if (res.status !== 200) {
    throw new Error(`loginAs: login failed for ${user.email} (status ${res.status}): ${JSON.stringify(res.body)}`);
  }
  return { Authorization: `Bearer ${res.body.data.token}` };
}

/** Convenience: creates a fresh user of the given role and logs in as them in one call. */
export async function getAuthHeader(role: UserRole): Promise<{ Authorization: string }> {
  const user = await createTestUser(role);
  return loginAs(user);
}

/** Convenience: creates a fresh user AND returns both the user and its auth header, for tests that need to assert against the caller's identity (e.g. attribution fields). */
export async function createTestUserWithAuthHeader(
  role: UserRole,
  namePrefix?: string,
): Promise<{ user: TestUser; authHeader: { Authorization: string } }> {
  const user = await createTestUser(role, namePrefix);
  const authHeader = await loginAs(user);
  return { user, authHeader };
}

export async function deleteTestUsers(userIds: bigint[]): Promise<void> {
  if (userIds.length === 0) return;
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
}
