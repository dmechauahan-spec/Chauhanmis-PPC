import { Router } from 'express';
import { validateRequest } from '../../middleware/validateRequest';
import { authenticate } from '../../middleware/authenticate';
import { authorize } from '../../middleware/authorize';
import { PERMISSIONS } from '../../config/permissions';
import * as controller from './purchaseItems.controller';
import {
  createPurchaseItemSchema,
  listPurchaseItemsQuerySchema,
  purchaseItemParamsSchema,
  updatePurchaseItemSchema,
} from './purchaseItems.schema';

const router = Router();

router.use(authenticate);
const read = authorize(...PERMISSIONS.purchaseItems.read);
const write = authorize(...PERMISSIONS.purchaseItems.write);

router.get('/', read, validateRequest({ query: listPurchaseItemsQuerySchema }), controller.list);
router.get('/:code', read, validateRequest({ params: purchaseItemParamsSchema }), controller.getByCode);
router.post('/', write, validateRequest({ body: createPurchaseItemSchema }), controller.create);
router.patch(
  '/:code',
  write,
  validateRequest({ params: purchaseItemParamsSchema, body: updatePurchaseItemSchema }),
  controller.update,
);
router.delete('/:code', write, validateRequest({ params: purchaseItemParamsSchema }), controller.remove);

export default router;
