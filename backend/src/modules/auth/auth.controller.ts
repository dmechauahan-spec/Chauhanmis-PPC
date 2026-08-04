import { Request, Response, NextFunction } from 'express';
import { sendSuccess } from '../../utils/apiResponse';
import * as authService from './auth.service';
import { generateCaptcha } from './captcha';
import { ForgotPasswordVerifyInput, ListUsersQuery, ResetPasswordInput } from './auth.schema';

export async function login(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await authService.login(req.body);
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
}

// req.user was already fetched fresh from the DB by the `authenticate`
// middleware for this very request — no second DB round trip needed here.
export async function me(req: Request, res: Response) {
  sendSuccess(res, req.user);
}

export async function createUser(req: Request, res: Response, next: NextFunction) {
  try {
    const user = await authService.createUser(req.body);
    sendSuccess(res, user, 201);
  } catch (err) {
    next(err);
  }
}

export async function listUsers(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await authService.listUsers(req.query as unknown as ListUsersQuery);
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
}

export async function updateUser(req: Request, res: Response, next: NextFunction) {
  try {
    const { userId } = req.params as unknown as { userId: bigint };
    const user = await authService.updateUser(userId, req.body);
    sendSuccess(res, user);
  } catch (err) {
    next(err);
  }
}

export async function getCaptcha(_req: Request, res: Response) {
  sendSuccess(res, generateCaptcha());
}

export async function forgotPasswordVerify(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await authService.forgotPasswordVerify(req.body as ForgotPasswordVerifyInput);
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
}

export async function resetPassword(req: Request, res: Response, next: NextFunction) {
  try {
    await authService.resetPassword(req.body as ResetPasswordInput);
    sendSuccess(res, { message: 'Password reset successfully. You may now log in with your new password.' });
  } catch (err) {
    next(err);
  }
}
