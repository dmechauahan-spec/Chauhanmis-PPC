import { Router } from 'express';
import { validateRequest } from '../../middleware/validateRequest';
import { authenticate } from '../../middleware/authenticate';
import { authorize } from '../../middleware/authorize';
import { PERMISSIONS } from '../../config/permissions';
import * as controller from './rfq.controller';
import {
  createQuotationSchema,
  createRfqSchema,
  listRfqsQuerySchema,
  rfqIdParamsSchema,
  rfqSupplierParamsSchema,
  selectSupplierSchema,
  updateQuotationSchema,
} from './rfq.schema';

const router = Router();

router.use(authenticate);
const read = authorize(...PERMISSIONS.rfq.read);
const write = authorize(...PERMISSIONS.rfq.write);

router.post('/', write, validateRequest({ body: createRfqSchema }), controller.create);
router.get('/', read, validateRequest({ query: listRfqsQuerySchema }), controller.list);
router.get('/:rfqId', read, validateRequest({ params: rfqIdParamsSchema }), controller.getById);
router.get('/:rfqId/compare', read, validateRequest({ params: rfqIdParamsSchema }), controller.compare);

router.post(
  '/:rfqId/quotations',
  write,
  validateRequest({ params: rfqIdParamsSchema, body: createQuotationSchema }),
  controller.createQuotation,
);
router.patch(
  '/:rfqId/quotations/:supplierId',
  write,
  validateRequest({ params: rfqSupplierParamsSchema, body: updateQuotationSchema }),
  controller.updateQuotation,
);

router.post(
  '/:rfqId/select-supplier',
  write,
  validateRequest({ params: rfqIdParamsSchema, body: selectSupplierSchema }),
  controller.selectSupplier,
);

export default router;
