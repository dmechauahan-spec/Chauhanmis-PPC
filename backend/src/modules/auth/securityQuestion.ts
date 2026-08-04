import { z } from 'zod';

// Fixed, small list of security-question options (not free-text questions,
// a known-weak practice) — see README "Self-Service Password Reset". Single
// source of truth for backend validation; the frontend user-creation form
// mirrors this same list.
export const SECURITY_QUESTIONS = [
  'What was the name of your first pet?',
  'What city were you born in?',
  "What was your school's name?",
  "What is your mother's maiden name?",
] as const;

export const securityQuestionEnum = z.enum(SECURITY_QUESTIONS);
export type SecurityQuestion = z.infer<typeof securityQuestionEnum>;

// Backfill sentinel for users created before this feature existed —
// deliberately NOT a member of SECURITY_QUESTIONS above, so Zod validation
// can never produce it as real input; it's only ever written by the
// migration's backfill UPDATE. The forgot-password flow checks for this
// exact value and rejects with a distinct "ask an Admin" error before ever
// attempting a bcrypt compare against securityAnswerHash (which holds the
// same sentinel string, not a real bcrypt hash — comparing against it would
// throw, not just fail).
export const SECURITY_QUESTION_NOT_SET = 'NOT_SET';

// Trims whitespace and lowercases before hashing/comparing — a real
// usability requirement for security questions, since "Fluffy" and " fluffy "
// should both be accepted as correct answers.
export function normalizeSecurityAnswer(answer: string): string {
  return answer.trim().toLowerCase();
}
