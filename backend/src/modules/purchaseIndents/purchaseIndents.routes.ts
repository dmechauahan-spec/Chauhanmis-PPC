import { Router } from 'express';
import { validateRequest } from '../../middleware/validateRequest';
import { authenticate } from '../../middleware/authenticate';
import { authorize } from '../../middleware/authorize';
import { PERMISSIONS } from '../../config/permissions';
import * as controller from './purchaseIndents.controller';
import {
  approveIndentSchema,
  createIndentSchema,
  indentIdParamsSchema,
  listIndentsQuerySchema,
  rejectIndentSchema,
} from './purchaseIndents.schema';

const router = Router();

router.use(authenticate);
const read = authorize(...PERMISSIONS.purchaseIndents.read);
// create/submit — deliberately ANY authenticated role (resolves to every
// role once Admin's automatic authorize() pass is added). See README
// "Purchase Module Part 1" and the PERMISSIONS.purchaseIndents comment.
const write = authorize(...PERMISSIONS.purchaseIndents.write);
// approve/reject — Admin/StoreManager only, a strictly narrower gate than
// `write` above.
const approve = authorize(...PERMISSIONS.purchaseIndents.approve);

router.post('/', write, validateRequest({ body: createIndentSchema }), controller.create);
router.post('/:indentId/submit', write, validateRequest({ params: indentIdParamsSchema }), controller.submit);
router.post(
  '/:indentId/approve',
  approve,
  validateRequest({ params: indentIdParamsSchema, body: approveIndentSchema }),
  controller.approve,
);
router.post(
  '/:indentId/reject',
  approve,
  validateRequest({ params: indentIdParamsSchema, body: rejectIndentSchema }),
  controller.reject,
);

router.get('/', read, validateRequest({ query: listIndentsQuerySchema }), controller.list);
router.get('/:indentId', read, validateRequest({ params: indentIdParamsSchema }), controller.getById);

export default router;
