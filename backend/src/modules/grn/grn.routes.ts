import { Router } from 'express';
import { validateRequest } from '../../middleware/validateRequest';
import { authenticate } from '../../middleware/authenticate';
import { authorize } from '../../middleware/authorize';
import { PERMISSIONS } from '../../config/permissions';
import * as controller from './grn.controller';
import { createGrnSchema, grnLineItemParamsSchema, grnNoParamsSchema, listGrnsQuerySchema, qcInspectGrnLineItemSchema } from './grn.schema';

const router = Router();

router.use(authenticate);
const read = authorize(...PERMISSIONS.grn.read);
const write = authorize(...PERMISSIONS.grn.write);

router.post('/', write, validateRequest({ body: createGrnSchema }), controller.create);
router.get('/', read, validateRequest({ query: listGrnsQuerySchema }), controller.list);
router.get('/:grnNo', read, validateRequest({ params: grnNoParamsSchema }), controller.getByNumber);

router.post(
  '/:grnNo/line-items/:id/qc-inspect',
  write,
  validateRequest({ params: grnLineItemParamsSchema, body: qcInspectGrnLineItemSchema }),
  controller.qcInspect,
);

export default router;
