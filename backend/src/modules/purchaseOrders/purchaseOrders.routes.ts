import { Router } from 'express';
import { validateRequest } from '../../middleware/validateRequest';
import { authenticate } from '../../middleware/authenticate';
import { authorize } from '../../middleware/authorize';
import { PERMISSIONS } from '../../config/permissions';
import * as controller from './purchaseOrders.controller';
import {
  amendPurchaseOrderSchema,
  createPurchaseOrderSchema,
  listPurchaseOrdersQuerySchema,
  poNumberParamsSchema,
  updatePoStatusSchema,
} from './purchaseOrders.schema';

const router = Router();

router.use(authenticate);
const read = authorize(...PERMISSIONS.purchaseOrders.read);
const write = authorize(...PERMISSIONS.purchaseOrders.write);

router.post('/', write, validateRequest({ body: createPurchaseOrderSchema }), controller.create);
router.get('/', read, validateRequest({ query: listPurchaseOrdersQuerySchema }), controller.list);
router.get('/:poNumber', read, validateRequest({ params: poNumberParamsSchema }), controller.getByNumber);

router.patch(
  '/:poNumber/status',
  write,
  validateRequest({ params: poNumberParamsSchema, body: updatePoStatusSchema }),
  controller.updateStatus,
);
router.patch(
  '/:poNumber',
  write,
  validateRequest({ params: poNumberParamsSchema, body: amendPurchaseOrderSchema }),
  controller.amend,
);

export default router;
