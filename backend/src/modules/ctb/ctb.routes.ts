import { Router } from 'express';
import { validateRequest } from '../../middleware/validateRequest';
import { authenticate } from '../../middleware/authenticate';
import { authorize } from '../../middleware/authorize';
import { PERMISSIONS } from '../../config/permissions';
import * as controller from './ctb.controller';
import { ctbDashboardQuerySchema, orderIdParamsSchema } from './ctb.schema';

const router = Router();

router.use(authenticate);
const read = authorize(...PERMISSIONS.ctb.read);
const write = authorize(...PERMISSIONS.ctb.write);

// Static paths before the /order/:orderId param routes, same convention as
// oee.routes.ts / dailyLogs.routes.ts. GET routes are `read` even though
// GET /order/:orderId can trigger a live evaluation-and-persist internally
// (same HTTP-verb-based convention as every other module: GET = read,
// POST/PATCH/DELETE = write); the explicit recheck endpoints are `write`.
router.get('/dashboard', read, validateRequest({ query: ctbDashboardQuerySchema }), controller.dashboard);
router.post('/recheck-all', write, controller.recheckAll);

router.get('/order/:orderId', read, validateRequest({ params: orderIdParamsSchema }), controller.getForOrder);
router.post(
  '/order/:orderId/recheck',
  write,
  validateRequest({ params: orderIdParamsSchema }),
  controller.recheckForOrder,
);

export default router;
