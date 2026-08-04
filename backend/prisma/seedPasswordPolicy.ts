import { PASSWORD_MIN_LENGTH } from '../src/modules/auth/auth.schema';
import { SECURITY_QUESTIONS } from '../src/modules/auth/securityQuestion';

// Reuses the exact same minimum createUser enforces via auth.schema.ts
// (rather than a second, possibly-drifting literal) — seed.ts's bootstrap
// Admin goes through bcrypt.hash directly, bypassing createUserSchema
// entirely, so this check is the only thing standing between a weak
// ADMIN_SEED_PASSWORD and a real Admin account with it.
//
// Kept in its own side-effect-free module (rather than inline in seed.ts,
// which runs its full seed — including a real DB connection — as a
// top-level side effect on import) so seed.test.ts can import and test this
// check directly without triggering that.
export function assertAdminSeedPasswordStrength(password: string): void {
  if (password.length < PASSWORD_MIN_LENGTH) {
    throw new Error(
      `ADMIN_SEED_PASSWORD must be at least ${PASSWORD_MIN_LENGTH} characters (same minimum createUser enforces) — refusing to create a weak-password Admin account.`,
    );
  }
}

// Same "fail loudly, don't silently create a weak/malformed account"
// principle, applied to the bootstrap Admin's security question — the
// User model requires a real one for every user (see the migration's
// backfill of pre-existing rows to the SECURITY_QUESTION_NOT_SET sentinel),
// so the seed script can't skip this the way it can skip the whole
// bootstrap-admin block when ADMIN_SEED_EMAIL/PASSWORD are absent entirely.
export function assertAdminSeedSecurityQuestionStrength(question: string, answer: string): void {
  if (!SECURITY_QUESTIONS.includes(question as (typeof SECURITY_QUESTIONS)[number])) {
    throw new Error(
      `ADMIN_SEED_SECURITY_QUESTION must be exactly one of: ${SECURITY_QUESTIONS.map((q) => `"${q}"`).join(', ')} — refusing to create an Admin account with an unrecognized security question.`,
    );
  }
  if (answer.trim().length === 0) {
    throw new Error(
      'ADMIN_SEED_SECURITY_ANSWER must not be blank — refusing to create an Admin account with an empty security answer.',
    );
  }
}
