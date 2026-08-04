import { z } from "zod";
import { SECURITY_QUESTIONS } from "@/lib/security-questions";

export const emailStepSchema = z.object({
  email: z.string().min(1, "Email is required").email("Enter a valid email address"),
});
export type EmailStepValues = z.infer<typeof emailStepSchema>;

// securityQuestion here is a client-side-only prompt/mnemonic for the user
// — the backend's verify endpoint takes just { email, captchaToken,
// captchaAnswer, securityAnswer } and doesn't know or check which question
// the UI showed (see forgot-password-page.tsx's top comment for why: the
// backend can't reveal which question is correct for a given email without
// reintroducing the account-enumeration risk it specifically avoids
// elsewhere). Picking the wrong question here is harmless — only the
// answer text is ever sent, and a wrong answer to any question produces the
// same generic failure either way.
export const verifyStepSchema = z.object({
  captchaAnswer: z
    .string()
    .min(1, "Enter the answer to the CAPTCHA")
    .regex(/^-?\d+$/, "Enter a whole number"),
  securityQuestion: z.enum(SECURITY_QUESTIONS, { message: "Select your security question" }),
  securityAnswer: z.string().min(1, "Security answer is required"),
});
export type VerifyStepValues = z.infer<typeof verifyStepSchema>;

// Mirrors ppc-backend's auth.schema.ts#PASSWORD_MIN_LENGTH (8).
export const resetStepSchema = z
  .object({
    newPassword: z.string().min(8, "Password must be at least 8 characters"),
    confirmPassword: z.string().min(1, "Confirm your new password"),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "Passwords don't match",
    path: ["confirmPassword"],
  });
export type ResetStepValues = z.infer<typeof resetStepSchema>;
