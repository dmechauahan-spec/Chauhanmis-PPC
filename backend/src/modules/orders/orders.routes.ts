import { Router } from 'express';
import { validateRequest } from '../../middleware/validateRequest';
import { authenticate } from '../../middleware/authenticate';
import { authorize } from '../../middleware/authorize';
import { PERMISSIONS } from '../../config/permissions';
import * as controller from './orders.controller';
import {
  createOrderSchema,
  listOrdersQuerySchema,
  orderParamsSchema,
  updateOrderStatusSchema,
} from './orders.schema';

const router = Router();

router.use(authenticate);
const read = authorize(...PERMISSIONS.orders.read);
const write = authorize(...PERMISSIONS.orders.write);

router.get('/', read, validateRequest({ query: listOrdersQuerySchema }), controller.list);
router.get('/:orderId', read, validateRequest({ params: orderParamsSchema }), controller.getById);
router.get(
  '/:orderId/history',
  read,
  validateRequest({ params: orderParamsSchema }),
  controller.getHistory,
);
router.post('/', write, validateRequest({ body: createOrderSchema }), controller.create);
router.patch(
  '/:orderId/status',
  write,
  validateRequest({ params: orderParamsSchema, body: updateOrderStatusSchema }),
  controller.updateStatus,
);
router.delete('/:orderId', write, validateRequest({ params: orderParamsSchema }), controller.remove);

export default router;
