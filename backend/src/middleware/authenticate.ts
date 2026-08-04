import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { UserRole } from '@prisma/client';
import { prisma } from '../db/client';
import { env } from '../config/env';
import { JWT_ALGORITHM } from '../config/jwt';
import { UnauthorizedError } from '../utils/errors';

export interface AuthenticatedUser {
  id: bigint;
  email: string;
  name: string;
  role: UserRole;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

interface AccessTokenPayload {
  sub: string;
}

function isAccessTokenPayload(payload: unknown): payload is AccessTokenPayload {
  return typeof payload === 'object' && payload !== null && typeof (payload as { sub?: unknown }).sub === 'string';
}

// Verifies the JWT and re-fetches the user from the DB on every request
// (never trusts the token's own claims for identity beyond the user id) —
// this is what makes a deactivated user's still-unexpired token stop
// working immediately, rather than only at its natural expiry. Never logs
// the token or password anywhere, even at debug level.
export async function authenticate(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      throw new UnauthorizedError();
    }
    const token = header.slice('Bearer '.length).trim();
    if (!token) {
      throw new UnauthorizedError();
    }

    let payload: unknown;
    try {
      payload = jwt.verify(token, env.JWT_SECRET, { algorithms: [JWT_ALGORITHM] });
    } catch {
      throw new UnauthorizedError('Invalid or expired token');
    }

    if (!isAccessTokenPayload(payload) || !/^\d+$/.test(payload.sub)) {
      throw new UnauthorizedError('Invalid or expired token');
    }

    const user = await prisma.user.findUnique({ where: { id: BigInt(payload.sub) } });
    if (!user || !user.isActive) {
      throw new UnauthorizedError('Invalid or expired token');
    }

    req.user = { id: user.id, email: user.email, name: user.name, role: user.role };
    next();
  } catch (err) {
    next(err);
  }
}
