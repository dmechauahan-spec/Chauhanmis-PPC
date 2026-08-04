import { z } from "zod";

// Client-side validation for form UX only — the backend (auth.schema.ts)
// re-validates independently and is the actual authority; this just avoids
// a round trip for the obvious cases (empty fields, malformed email).
export const loginFormSchema = z.object({
  email: z.string().min(1, "Email is required").email("Enter a valid email address"),
  password: z.string().min(1, "Password is required"),
});

export type LoginFormValues = z.infer<typeof loginFormSchema>;
