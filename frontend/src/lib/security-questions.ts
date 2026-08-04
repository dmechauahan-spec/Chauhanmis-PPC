// Mirrors ppc-backend's src/modules/auth/securityQuestion.ts#SECURITY_QUESTIONS
// exactly — a fixed, small list (not free text, a known-weak practice for
// security questions), shared between the New User form (account creation)
// and the Forgot Password flow's question picker.
export const SECURITY_QUESTIONS = [
  "What was the name of your first pet?",
  "What city were you born in?",
  "What was your school's name?",
  "What is your mother's maiden name?",
] as const;

export type SecurityQuestion = (typeof SECURITY_QUESTIONS)[number];
