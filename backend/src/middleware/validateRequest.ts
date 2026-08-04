import { NextFunction, Request, Response } from 'express';
import { ZodError, ZodSchema } from 'zod';
import { ValidationError } from '../utils/errors';

interface ValidationSchemas {
  body?: ZodSchema;
  params?: ZodSchema;
  query?: ZodSchema;
}

export function validateRequest(schemas: ValidationSchemas) {
  return (req: Request, _res: Response, next: NextFunction) => {
    try {
      if (schemas.params) {
        req.params = schemas.params.parse(req.params);
      }
      if (schemas.query) {
        // Express 5 makes req.query a getter-only property; assign field by field instead.
        const parsedQuery = schemas.query.parse(req.query) as Record<string, unknown>;
        Object.keys(req.query).forEach((key) => delete (req.query as Record<string, unknown>)[key]);
        Object.assign(req.query, parsedQuery);
      }
      if (schemas.body) {
        req.body = schemas.body.parse(req.body);
      }
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        next(new ValidationError('Validation failed', err.flatten()));
        return;
      }
      next(err);
    }
  };
}
