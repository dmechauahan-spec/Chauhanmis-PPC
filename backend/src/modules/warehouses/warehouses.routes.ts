import { Router } from 'express';
import { validateRequest } from '../../middleware/validateRequest';
import { authenticate } from '../../middleware/authenticate';
import { authorize } from '../../middleware/authorize';
import { PERMISSIONS } from '../../config/permissions';
import * as controller from './warehouses.controller';
import {
  createWarehouseSchema,
  listWarehousesQuerySchema,
  warehouseParamsSchema,
  updateWarehouseSchema,
} from './warehouses.schema';

const router = Router();

router.use(authenticate);
const read = authorize(...PERMISSIONS.warehouses.read);
const write = authorize(...PERMISSIONS.warehouses.write);

router.get('/', read, validateRequest({ query: listWarehousesQuerySchema }), controller.list);
router.get('/:warehouseId', read, validateRequest({ params: warehouseParamsSchema }), controller.getById);
router.post('/', write, validateRequest({ body: createWarehouseSchema }), controller.create);
router.patch(
  '/:warehouseId',
  write,
  validateRequest({ params: warehouseParamsSchema, body: updateWarehouseSchema }),
  controller.update,
);
router.delete('/:warehouseId', write, validateRequest({ params: warehouseParamsSchema }), controller.remove);

export default router;
