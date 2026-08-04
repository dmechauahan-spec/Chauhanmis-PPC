import { z } from 'zod';
import { UserRole } from '@prisma/client';
import { paginationQuerySchema } from '../../utils/pagination';
import { securityQuestionEnum } from './securityQuestion';

// Named constant, not a magic number — see README "Authentication & Authorization".
export const PASSWORD_MIN_LENGTH = 8;

export const userIdParamsSchema = z.object({
  userId: z
    .string()
    .regex(/^\d+$/, 'userId must be a positive integer')
    .transform((val) => BigInt(val)),
});

export const loginSchema = z.object({
  email: z.string().email('email must be a valid email address'),
  password: z.string().min(1, 'password is required'),
});

export const createUserSchema = z.object({
  email: z.string().email('email must be a valid email address'),
  password: z.string().min(PASSWORD_MIN_LENGTH, `password must be at least ${PASSWORD_MIN_LENGTH} characters`),
  name: z.string().min(1, 'name is required'),
  role: z.nativeEnum(UserRole),
  // Self-service "Forgot Password" identity check — see
  // README "Self-Service Password Reset". Required for every new user;
  // securityQuestion must be one of the fixed list (not free text).
  securityQuestion: securityQuestionEnum,
  securityAnswer: z.string().min(1, 'securityAnswer is required'),
});

export const updateUserSchema = z
  .object({
    name: z.string().min(1),
    role: z.nativeEnum(UserRole),
    isActive: z.boolean(),
    // Optional pair, both-or-neither — this is how an Admin fixes a
    // legacy/backfilled account still holding the SECURITY_QUESTION_NOT_SET
    // sentinel (see securityQuestion.ts), since there's no self-service
    // "update my own security question" endpoint in this pass.
    securityQuestion: securityQuestionEnum,
    securityAnswer: z.string().min(1),
  })
  .partial()
  .refine((data) => Object.keys(data).length > 0, { message: 'At least one field must be provided' })
  .refine((data) => (data.securityQuestion === undefined) === (data.securityAnswer === undefined), {
    message: 'securityQuestion and securityAnswer must be provided together',
  });

export const listUsersQuerySchema = paginationQuerySchema.extend({
  role: z.nativeEnum(UserRole).optional(),
});

export const captchaVerifySchema = z.object({
  captchaToken: z.string().min(1, 'captchaToken is required'),
  captchaAnswer: z.coerce.number(),
});

export const forgotPasswordVerifySchema = z.object({
  email: z.string().email('email must be a valid email address'),
  securityAnswer: z.string().min(1, 'securityAnswer is required'),
}).merge(captchaVerifySchema);

export const resetPasswordSchema = z.object({
  resetToken: z.string().min(1, 'resetToken is required'),
  newPassword: z.string().min(PASSWORD_MIN_LENGTH, `newPassword must be at least ${PASSWORD_MIN_LENGTH} characters`),
});

export type UserIdParams = z.infer<typeof userIdParamsSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
export type ListUsersQuery = z.infer<typeof listUsersQuerySchema>;
export type ForgotPasswordVerifyInput = z.infer<typeof forgotPasswordVerifySchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
