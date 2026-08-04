import { NextFunction, Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { AppError } from '../utils/errors';
import { logger } from './requestLogger';

export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    success: false,
    error: { message: `Route ${req.method} ${req.path} not found` },
  });
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof AppError) {
    if (err.statusCode >= 500) {
      logger.error({ err }, err.message);
    }
    res.status(err.statusCode).json({
      success: false,
      error: { message: err.message, details: err.details },
    });
    return;
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    // P2002: unique constraint, P2003: FK constraint, P2025: record not found
    if (err.code === 'P2002') {
      res.status(409).json({
        success: false,
        error: { message: 'Unique constraint violation', details: err.meta },
      });
      return;
    }
    if (err.code === 'P2003') {
      res.status(400).json({
        success: false,
        error: { message: 'Related record does not exist', details: err.meta },
      });
      return;
    }
    if (err.code === 'P2025') {
      res.status(404).json({
        success: false,
        error: { message: 'Record not found', details: err.meta },
      });
      return;
    }
  }

  logger.error({ err }, 'Unhandled error');
  res.status(500).json({
    success: false,
    error: { message: 'Internal server error' },
  });
}
