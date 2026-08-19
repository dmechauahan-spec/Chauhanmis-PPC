import { Router } from 'express';
import { validateRequest } from '../../middleware/validateRequest';
import { authenticate } from '../../middleware/authenticate';
import { authorize } from '../../middleware/authorize';
import { PERMISSIONS } from '../../config/permissions';
import * as controller from './fgDashboard.controller';
import { fgBatchTraceParamsSchema, fgDashboardQuerySchema } from './fgDashboard.schema';

// FG Module Part 5 (final part) — two composition-only endpoints, same
// discipline as Module 14's dashboard.routes.ts / Client Flow Part 5's
// orderStatusDashboard.routes.ts. See README "FG Module Part 5".
//
// Mounted at TWO different base paths in app.ts: the default export
// (summary) at /api/fg-dashboard, and the named `fgBatchTraceRouter` export
// (trace) at /api/fg-batches — alongside fgBatch.routes.ts's own router, not
// replacing it, since trace is fundamentally an FgBatch-scoped read
// (/:fgBatchNo/trace), the same base path as that router's own
// /:fgBatchNo/movements. Express matches whichever mounted router's routes
// fit the request path, so two routers sharing one base path is safe — no
// conflict, since /:fgBatchNo/trace (two segments) never matches
// fgBatch.routes.ts's own bare /:fgBatchNo (one segment).
const router = Router();

router.use(authenticate);
const read = authorize(...PERMISSIONS.fgDashboard.read);

router.get('/', read, validateRequest({ query: fgDashboardQuerySchema }), controller.summary);

export default router;

export const fgBatchTraceRouter = Router();
fgBatchTraceRouter.use(authenticate);
fgBatchTraceRouter.get(
  '/:fgBatchNo/trace',
  read,
  validateRequest({ params: fgBatchTraceParamsSchema }),
  controller.trace,
);
