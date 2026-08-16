import { Router } from 'express';
import { validateRequest } from '../../middleware/validateRequest';
import { authenticate } from '../../middleware/authenticate';
import { authorize } from '../../middleware/authorize';
import { PERMISSIONS } from '../../config/permissions';
import * as controller from './productionPlan.controller';
import { orderIdParamsSchema } from './productionPlan.schema';

const router = Router();

router.use(authenticate);
const read = authorize(...PERMISSIONS.productionPlan.read);
const write = authorize(...PERMISSIONS.productionPlan.write);

router.post(
  '/generate/:orderId',
  write,
  validateRequest({ params: orderIdParamsSchema }),
  controller.generate,
);
router.get('/:orderId', read, validateRequest({ params: orderIdParamsSchema }), controller.getByOrderId);
router.get(
  '/:orderId/plan-vs-actual',
  read,
  validateRequest({ params: orderIdParamsSchema }),
  controller.getPlanVsActual,
);

export default router;
