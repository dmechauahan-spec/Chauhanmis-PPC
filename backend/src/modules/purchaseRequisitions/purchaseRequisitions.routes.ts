import { Router } from 'express';
import { validateRequest } from '../../middleware/validateRequest';
import { authenticate } from '../../middleware/authenticate';
import { authorize } from '../../middleware/authorize';
import { PERMISSIONS } from '../../config/permissions';
import * as controller from './purchaseRequisitions.controller';
import {
  generatePrSchema,
  listPrQuerySchema,
  prIdParamsSchema,
  updatePrStatusSchema,
} from './purchaseRequisitions.schema';

const router = Router();

router.use(authenticate);
const read = authorize(...PERMISSIONS.purchaseRequisitions.read);
const write = authorize(...PERMISSIONS.purchaseRequisitions.write);

router.post('/generate', write, validateRequest({ body: generatePrSchema }), controller.generate);

router.get('/', read, validateRequest({ query: listPrQuerySchema }), controller.list);
router.get('/:prId', read, validateRequest({ params: prIdParamsSchema }), controller.getById);

router.patch(
  '/:prId/status',
  write,
  validateRequest({ params: prIdParamsSchema, body: updatePrStatusSchema }),
  controller.updateStatus,
);

export default router;
