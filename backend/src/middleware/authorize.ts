import { NextFunction, Request, Response } from 'express';
import { UserRole } from '@prisma/client';
import { ForbiddenError, UnauthorizedError } from '../utils/errors';

// Admin always passes every authorize() check regardless of the specific
// roles listed — implemented once, here, so no route ever needs to spell
// out "or Admin" in its own allowed-roles array. Call with zero roles
// (`authorize()`) for an Admin-only endpoint. Must run after `authenticate`
// (req.user must already be set); the missing-user branch below is a
// defensive fallback, not the expected path.
export function authorize(...allowedRoles: UserRole[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      next(new UnauthorizedError());
      return;
    }
    if (req.user.role === UserRole.Admin || allowedRoles.includes(req.user.role)) {
      next();
      return;
    }
    next(new ForbiddenError(`Role '${req.user.role}' is not permitted to perform this action.`));
  };
}
