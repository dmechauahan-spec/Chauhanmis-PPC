import { Router } from 'express';
import { validateRequest } from '../../middleware/validateRequest';
import { authenticate } from '../../middleware/authenticate';
import { authorize } from '../../middleware/authorize';
import { PERMISSIONS } from '../../config/permissions';
import * as controller from './products.controller';
import {
  createProductSchema,
  listProductsQuerySchema,
  productParamsSchema,
  updateProductSchema,
} from './products.schema';

const router = Router();

router.use(authenticate);
const read = authorize(...PERMISSIONS.products.read);
const write = authorize(...PERMISSIONS.products.write);

router.get('/', read, validateRequest({ query: listProductsQuerySchema }), controller.list);
router.get('/:modelId', read, validateRequest({ params: productParamsSchema }), controller.getById);
router.post('/', write, validateRequest({ body: createProductSchema }), controller.create);
router.patch(
  '/:modelId',
  write,
  validateRequest({ params: productParamsSchema, body: updateProductSchema }),
  controller.update,
);
router.delete('/:modelId', write, validateRequest({ params: productParamsSchema }), controller.remove);

export default router;
