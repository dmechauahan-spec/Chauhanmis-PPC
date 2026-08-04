import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { randomBytes, createHash } from 'crypto';
import { Prisma, User, UserRole } from '@prisma/client';
import { prisma } from '../../db/client';
import { env } from '../../config/env';
import { JWT_ALGORITHM } from '../../config/jwt';
import { BusinessRuleError, ForbiddenError, NotFoundError, UnauthorizedError } from '../../utils/errors';
import { buildPaginated, PaginatedResult } from '../../utils/apiResponse';
import { toSkipTake } from '../../utils/pagination';
import { normalizeSecurityAnswer, SECURITY_QUESTION_NOT_SET } from './securityQuestion';
import { verifyCaptcha } from './captcha';
import {
  CreateUserInput,
  ForgotPasswordVerifyInput,
  ListUsersQuery,
  LoginInput,
  ResetPasswordInput,
  UpdateUserInput,
} from './auth.schema';

const BCRYPT_SALT_ROUNDS = 10;

// A single access token, no refresh-token rotation for this version — see
// README "Authentication & Authorization" for why 8 hours (matching a work
// shift) is a deliberate simplification, not an oversight.
const TOKEN_EXPIRY = '8h';

// Self-Service Password Reset — see README. The reset token is a signed JWT
// (so it's self-verifying and stateless on the wire) whose SHA-256 digest is
// also stored server-side, which is what makes it single-use/revocable: the
// JWT alone proves authenticity, the DB row proves it hasn't already been
// spent.
const RESET_TOKEN_EXPIRY_MINUTES = 15;
const RESET_TOKEN_EXPIRY_MS = RESET_TOKEN_EXPIRY_MINUTES * 60 * 1000;

// Deliberately identical for every failure mode short of full success (wrong
// email, wrong security answer, inactive account) — see README for why this
// endpoint never distinguishes which part was wrong. The one exception is
// the SECURITY_QUESTION_NOT_SET sentinel case, handled separately below.
const FORGOT_PASSWORD_GENERIC_ERROR =
  'Unable to verify your identity with the details provided. Check your email, security question answer, and CAPTCHA, then try again.';

const RESET_TOKEN_INVALID_MESSAGE = 'Invalid or expired reset token. Please restart the forgot-password process.';

function hashResetToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

// Never select passwordHash into any response payload, from any endpoint,
// ever — every user-shaped response in this module goes through this
// explicit allowlist rather than spreading a raw Prisma row.
const SAFE_USER_SELECT = {
  id: true,
  email: true,
  name: true,
  role: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.UserSelect;

export type SafeUser = Prisma.UserGetPayload<{ select: typeof SAFE_USER_SELECT }>;

function toSafeUser(user: User): SafeUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    isActive: user.isActive,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

// Computed once, lazily, on first use — compared against when the email
// doesn't match any user, so a login attempt against a nonexistent email
// takes roughly the same time as one against a real email with a wrong
// password (a bcrypt.compare either way), rather than returning
// near-instantly and leaking via timing which emails exist.
let dummyHashPromise: Promise<string> | null = null;
function getDummyHash(): Promise<string> {
  if (!dummyHashPromise) {
    dummyHashPromise = bcrypt.hash('not-a-real-password-timing-safety-only', BCRYPT_SALT_ROUNDS);
  }
  return dummyHashPromise;
}

export interface LoginResult {
  token: string;
  user: SafeUser;
}

// Endpoint #1. Deliberately generic on any credential failure — never
// reveals whether the email or the password was the specific problem.
// isActive is checked only AFTER credentials are confirmed correct, so an
// attacker can't use the 401-vs-403 distinction to enumerate which emails
// belong to deactivated accounts. Never logs the password, the token, or
// the password hash anywhere, at any log level.
export async function login(input: LoginInput): Promise<LoginResult> {
  const user = await prisma.user.findUnique({ where: { email: input.email } });
  const passwordMatches = await bcrypt.compare(input.password, user?.passwordHash ?? (await getDummyHash()));

  if (!user || !passwordMatches) {
    throw new UnauthorizedError('Invalid email or password');
  }
  if (!user.isActive) {
    throw new ForbiddenError('This account has been deactivated');
  }

  const token = jwt.sign({ sub: user.id.toString() }, env.JWT_SECRET, {
    expiresIn: TOKEN_EXPIRY,
    algorithm: JWT_ALGORITHM,
  });
  return { token, user: toSafeUser(user) };
}

// Endpoint #3. Admin-only (enforced at the route level). Email uniqueness
// is checked explicitly for a clear 409 message — the DB's own unique
// constraint would also catch a genuine race, via the generic P2002
// mapping in errorHandler, as a defensive backstop.
export async function createUser(input: CreateUserInput): Promise<SafeUser> {
  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) {
    throw new BusinessRuleError(`Email '${input.email}' is already in use.`, { email: input.email }, 409);
  }

  const passwordHash = await bcrypt.hash(input.password, BCRYPT_SALT_ROUNDS);
  const securityAnswerHash = await bcrypt.hash(normalizeSecurityAnswer(input.securityAnswer), BCRYPT_SALT_ROUNDS);
  const user = await prisma.user.create({
    data: {
      email: input.email,
      passwordHash,
      name: input.name,
      role: input.role,
      securityQuestion: input.securityQuestion,
      securityAnswerHash,
    },
    select: SAFE_USER_SELECT,
  });
  return user;
}

// Endpoint #4. Admin-only.
export async function listUsers(query: ListUsersQuery): Promise<PaginatedResult<SafeUser>> {
  const where: Prisma.UserWhereInput = {};
  if (query.role) where.role = query.role as UserRole;

  const { skip, take } = toSkipTake(query);
  const [items, total] = await prisma.$transaction([
    prisma.user.findMany({ where, skip, take, orderBy: { createdAt: 'desc' }, select: SAFE_USER_SELECT }),
    prisma.user.count({ where }),
  ]);

  return buildPaginated(items, total, query.page, query.pageSize);
}

// Endpoint #5. Admin-only. Deactivating (isActive: false) is the preferred
// way to remove a user's access — there is no delete endpoint, so every
// user a person has ever acted as (changedBy/savedBy/etc. attribution)
// stays intact in the audit trail. See README.
export async function updateUser(userId: bigint, data: UpdateUserInput): Promise<SafeUser> {
  const existing = await prisma.user.findUnique({ where: { id: userId } });
  if (!existing) {
    throw new NotFoundError('User', userId.toString());
  }

  // securityAnswer (plain text) never reaches Prisma directly — it's hashed
  // here and written to securityAnswerHash instead. This is the one place an
  // Admin can fix a legacy account still holding the
  // SECURITY_QUESTION_NOT_SET sentinel (see securityQuestion.ts); the schema
  // guarantees securityQuestion/securityAnswer arrive together or not at all.
  const { securityAnswer, ...rest } = data;
  const updateData: Prisma.UserUpdateInput = { ...rest };
  if (securityAnswer !== undefined) {
    updateData.securityAnswerHash = await bcrypt.hash(normalizeSecurityAnswer(securityAnswer), BCRYPT_SALT_ROUNDS);
  }

  return prisma.user.update({ where: { id: userId }, data: updateData, select: SAFE_USER_SELECT });
}

// Endpoint #6. Public (no auth) — see README "Self-Service Password Reset".
// CAPTCHA is verified first (cheap, fails fast, and its failure is reported
// distinctly since it reveals nothing about any account). Everything after
// that — unknown email, wrong security answer, inactive account — collapses
// into one generic error so this endpoint can't be used to enumerate which
// emails exist or which part of the identity check failed. The one
// exception is SECURITY_QUESTION_NOT_SET: a legacy/backfilled account with
// no real security question yet gets a distinct, actionable error, which is
// a deliberate, accepted tradeoff (see README) — it does confirm the email
// belongs to a real (if not-yet-configured) account, in exchange for not
// leaving real users of those accounts with no path forward at all.
export async function forgotPasswordVerify(input: ForgotPasswordVerifyInput): Promise<{ resetToken: string }> {
  if (!verifyCaptcha(input.captchaToken, input.captchaAnswer)) {
    throw new UnauthorizedError('Incorrect or expired CAPTCHA answer. Please request a new CAPTCHA and try again.');
  }

  const user = await prisma.user.findUnique({ where: { email: input.email } });

  // Must happen before any bcrypt.compare against securityAnswerHash — the
  // sentinel value there ('NOT_SET') isn't a valid bcrypt hash, and
  // bcrypt.compare throws (rather than returning false) on a malformed hash.
  if (user && user.securityQuestion === SECURITY_QUESTION_NOT_SET) {
    throw new BusinessRuleError(
      "This account doesn't have a security question configured yet. Ask an Admin to set one via PATCH /api/auth/users/:userId before you can reset your password.",
    );
  }

  // Same timing-safety pattern as login(): a bcrypt.compare runs either way,
  // against a real hash or a dummy one, so a nonexistent email doesn't
  // return measurably faster than a real one with a wrong answer.
  const normalizedAnswer = normalizeSecurityAnswer(input.securityAnswer);
  const answerMatches = await bcrypt.compare(normalizedAnswer, user?.securityAnswerHash ?? (await getDummyHash()));

  if (!user || !user.isActive || !answerMatches) {
    throw new UnauthorizedError(FORGOT_PASSWORD_GENERIC_ERROR);
  }

  const nonce = randomBytes(32).toString('hex');
  const resetToken = jwt.sign({ sub: user.id.toString(), nonce }, env.JWT_SECRET, {
    expiresIn: `${RESET_TOKEN_EXPIRY_MINUTES}m`,
    algorithm: JWT_ALGORITHM,
  });

  await prisma.passwordResetToken.create({
    data: {
      userId: user.id,
      tokenHash: hashResetToken(resetToken),
      expiresAt: new Date(Date.now() + RESET_TOKEN_EXPIRY_MS),
    },
  });

  // Returned directly to the caller rather than emailed — this API has no
  // email infrastructure. Acceptable ONLY because the CAPTCHA + security-
  // question check immediately above is the actual identity proof; in a
  // system with real email, this token would be emailed instead of returned
  // here. See README.
  return { resetToken };
}

// Endpoint #7. Public (no auth) — the second half of the flow above.
export async function resetPassword(input: ResetPasswordInput): Promise<void> {
  try {
    jwt.verify(input.resetToken, env.JWT_SECRET, { algorithms: [JWT_ALGORITHM] });
  } catch {
    throw new UnauthorizedError(RESET_TOKEN_INVALID_MESSAGE);
  }

  const tokenHash = hashResetToken(input.resetToken);
  const record = await prisma.passwordResetToken.findUnique({ where: { tokenHash } });

  if (!record || record.usedAt || record.expiresAt < new Date()) {
    throw new UnauthorizedError(RESET_TOKEN_INVALID_MESSAGE);
  }

  const passwordHash = await bcrypt.hash(input.newPassword, BCRYPT_SALT_ROUNDS);
  const usedAt = new Date();

  await prisma.$transaction([
    prisma.user.update({ where: { id: record.userId }, data: { passwordHash } }),
    prisma.passwordResetToken.update({ where: { id: record.id }, data: { usedAt } }),
    // Belt-and-suspenders: invalidate any OTHER outstanding unused reset
    // tokens for this same user, in case multiple reset attempts were in
    // flight — a stale, still-valid token from an earlier request shouldn't
    // remain usable after a password has already been reset.
    prisma.passwordResetToken.updateMany({
      where: { userId: record.userId, usedAt: null, NOT: { id: record.id } },
      data: { usedAt },
    }),
  ]);
}
