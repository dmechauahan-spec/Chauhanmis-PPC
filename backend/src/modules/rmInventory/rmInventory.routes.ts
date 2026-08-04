import { Router } from 'express';
import { validateRequest } from '../../middleware/validateRequest';
import { authenticate } from '../../middleware/authenticate';
import { authorize } from '../../middleware/authorize';
import { PERMISSIONS } from '../../config/permissions';
import * as controller from './rmInventory.controller';
import {
  adjustStockSchema,
  createRmInventorySchema,
  listRmInventoryQuerySchema,
  partIdParamsSchema,
  updateRmInventorySchema,
} from './rmInventory.schema';

const router = Router();

router.use(authenticate);
const read = authorize(...PERMISSIONS.rmInventory.read);
const write = authorize(...PERMISSIONS.rmInventory.write);

router.get('/', read, validateRequest({ query: listRmInventoryQuerySchema }), controller.list);
router.get('/:partId', read, validateRequest({ params: partIdParamsSchema }), controller.getById);
router.get(
  '/:partId/transactions',
  read,
  validateRequest({ params: partIdParamsSchema }),
  controller.listTransactions,
);
router.post('/', write, validateRequest({ body: createRmInventorySchema }), controller.create);
// Stock-adjustment is not a special exception — it's simply part of
// StoreManager's normal RM Inventory write access, same as every other
// write here. See README "Authentication & Authorization".
router.patch(
  '/:partId/adjust-stock',
  write,
  validateRequest({ params: partIdParamsSchema, body: adjustStockSchema }),
  controller.adjustStock,
);
router.patch(
  '/:partId',
  write,
  validateRequest({ params: partIdParamsSchema, body: updateRmInventorySchema }),
  controller.update,
);
router.delete('/:partId', write, validateRequest({ params: partIdParamsSchema }), controller.remove);

export default router;
