import { Router } from 'express';
import { validateRequest } from '../../middleware/validateRequest';
import { authenticate } from '../../middleware/authenticate';
import { authorize } from '../../middleware/authorize';
import { PERMISSIONS } from '../../config/permissions';
import * as controller from './risk.controller';
import { listAtRiskOrdersQuerySchema, orderIdParamsSchema } from './risk.schema';

const router = Router();

router.use(authenticate);
const read = authorize(...PERMISSIONS.risk.read);

router.get('/summary', read, controller.summary);
router.get('/at-risk-orders', read, validateRequest({ query: listAtRiskOrdersQuerySchema }), controller.listAtRisk);
router.get(
  '/at-risk-orders/:orderId/recommendations',
  read,
  validateRequest({ params: orderIdParamsSchema }),
  controller.getRecommendations,
);

export default router;
