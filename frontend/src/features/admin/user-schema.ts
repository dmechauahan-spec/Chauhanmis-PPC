import { z } from "zod";
import { SECURITY_QUESTIONS } from "@/lib/security-questions";

const ROLES = ["Admin", "StoreManager", "ProductionManager"] as const;

// Mirrors ppc-backend's auth.schema.ts#PASSWORD_MIN_LENGTH (8).
export const createUserFormSchema = z.object({
  email: z.string().email("Enter a valid email address"),
  name: z.string().min(1, "Name is required"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  role: z.enum(ROLES),
  // Self-service "Forgot Password" identity check — required for every new
  // user, mirroring ppc-backend's createUserSchema exactly.
  securityQuestion: z.enum(SECURITY_QUESTIONS, { message: "Select a security question" }),
  securityAnswer: z.string().min(1, "Security answer is required"),
});

export type CreateUserFormValues = z.infer<typeof createUserFormSchema>;

// No password field here at all — there's no password-change endpoint on
// the backend (see types/api.ts's UpdateUserPayload comment). Deactivating
// (isActive: false) is the only supported way to remove access; there is
// no delete endpoint.
export const editUserFormSchema = z.object({
  name: z.string().min(1, "Name is required"),
  role: z.enum(ROLES),
  isActive: z.enum(["true", "false"]),
});

export type EditUserFormValues = z.infer<typeof editUserFormSchema>;
