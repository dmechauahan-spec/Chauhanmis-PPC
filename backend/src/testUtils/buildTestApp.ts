import express, { Express, Router } from 'express';
import { errorHandler, notFoundHandler } from '../middleware/errorHandler';
import { installBigIntJsonSupport } from '../utils/bigint';

installBigIntJsonSupport();

// Mounts a single module router in isolation (with the same JSON parsing and
// error-handling pipeline as the real app) so each module's tests don't
// depend on every other module already existing / compiling.
export function buildTestApp(basePath: string, router: Router): Express {
  const app = express();
  app.use(express.json());
  app.use(basePath, router);
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
