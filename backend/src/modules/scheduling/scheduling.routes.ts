import { Router } from 'express';
import { validateRequest } from '../../middleware/validateRequest';
import { authenticate } from '../../middleware/authenticate';
import { authorize } from '../../middleware/authorize';
import { PERMISSIONS } from '../../config/permissions';
import * as controller from './scheduling.controller';
import {
  listScheduleQuerySchema,
  orderIdParamsSchema,
  runSchedulingSchema,
  unscheduleOrderSchema,
} from './scheduling.schema';

const router = Router();

router.use(authenticate);
const read = authorize(...PERMISSIONS.scheduling.read);
const write = authorize(...PERMISSIONS.scheduling.write);

router.post('/run', write, validateRequest({ body: runSchedulingSchema }), controller.run);

router.get('/schedule', read, validateRequest({ query: listScheduleQuerySchema }), controller.list);
router.get('/schedule/:orderId', read, validateRequest({ params: orderIdParamsSchema }), controller.getByOrderId);
router.delete(
  '/schedule/:orderId',
  write,
  validateRequest({ params: orderIdParamsSchema, body: unscheduleOrderSchema }),
  controller.unschedule,
);

export default router;
