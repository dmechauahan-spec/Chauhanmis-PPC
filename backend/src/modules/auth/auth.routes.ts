import { Router } from 'express';
import { validateRequest } from '../../middleware/validateRequest';
import { authenticate } from '../../middleware/authenticate';
import { authorize } from '../../middleware/authorize';
import { loginRateLimiter } from './loginRateLimiter';
import { forgotPasswordRateLimiter } from './forgotPasswordRateLimiter';
import * as controller from './auth.controller';
import {
  createUserSchema,
  forgotPasswordVerifySchema,
  listUsersQuerySchema,
  loginSchema,
  resetPasswordSchema,
  updateUserSchema,
  userIdParamsSchema,
} from './auth.schema';

const router = Router();

router.post('/login', loginRateLimiter, validateRequest({ body: loginSchema }), controller.login);
router.get('/me', authenticate, controller.me);

// Self-Service Password Reset — all three are intentionally PUBLIC routes
// (no `authenticate`): they exist precisely for a logged-out user. See
// README "Self-Service Password Reset".
router.get('/captcha', controller.getCaptcha);
router.post(
  '/forgot-password/verify',
  forgotPasswordRateLimiter,
  validateRequest({ body: forgotPasswordVerifySchema }),
  controller.forgotPasswordVerify,
);
router.post(
  '/forgot-password/reset',
  validateRequest({ body: resetPasswordSchema }),
  controller.resetPassword,
);

// Admin-only user management — authorize() with no roles listed means only
// Admin ever passes, per the central authorize() convention.
router.post('/users', authenticate, authorize(), validateRequest({ body: createUserSchema }), controller.createUser);
router.get('/users', authenticate, authorize(), validateRequest({ query: listUsersQuerySchema }), controller.listUsers);
router.patch(
  '/users/:userId',
  authenticate,
  authorize(),
  validateRequest({ params: userIdParamsSchema, body: updateUserSchema }),
  controller.updateUser,
);

export default router;
