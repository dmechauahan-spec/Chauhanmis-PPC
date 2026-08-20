import { Router } from 'express';
import { validateRequest } from '../../middleware/validateRequest';
import { authenticate } from '../../middleware/authenticate';
import { authorize } from '../../middleware/authorize';
import { PERMISSIONS } from '../../config/permissions';
import * as controller from './suppliers.controller';
import {
  createSupplierSchema,
  listSuppliersQuerySchema,
  supplierParamsSchema,
  updateSupplierSchema,
} from './suppliers.schema';

const router = Router();

router.use(authenticate);
const read = authorize(...PERMISSIONS.suppliers.read);
const write = authorize(...PERMISSIONS.suppliers.write);

router.get('/', read, validateRequest({ query: listSuppliersQuerySchema }), controller.list);
router.get('/:code', read, validateRequest({ params: supplierParamsSchema }), controller.getByCode);
router.post('/', write, validateRequest({ body: createSupplierSchema }), controller.create);
router.patch(
  '/:code',
  write,
  validateRequest({ params: supplierParamsSchema, body: updateSupplierSchema }),
  controller.update,
);
router.delete('/:code', write, validateRequest({ params: supplierParamsSchema }), controller.remove);

export default router;
