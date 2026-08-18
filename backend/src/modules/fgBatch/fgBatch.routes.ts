import { Router } from 'express';
import { validateRequest } from '../../middleware/validateRequest';
import { authenticate } from '../../middleware/authenticate';
import { authorize } from '../../middleware/authorize';
import { PERMISSIONS } from '../../config/permissions';
import * as controller from './fgBatch.controller';
import {
  fgBatchNoParamsSchema,
  generateFgBatchSchema,
  holdFgBatchSchema,
  listFgBatchesQuerySchema,
  listFgMovementsQuerySchema,
  releaseHoldFgBatchSchema,
  transferFgBatchSchema,
} from './fgBatch.schema';

const router = Router();

router.use(authenticate);
const read = authorize(...PERMISSIONS.fgBatch.read);
const write = authorize(...PERMISSIONS.fgBatch.write);
// FG Module Part 2 — transfer/hold/release-hold/movements are warehouse-
// side actions, a distinct permission from fgBatch's own creation-side
// write above — see README "FG Module Part 2" / permissions.ts.
const movementsRead = authorize(...PERMISSIONS.fgStockMovements.read);
const movementsWrite = authorize(...PERMISSIONS.fgStockMovements.write);

router.post('/generate', write, validateRequest({ body: generateFgBatchSchema }), controller.generate);
router.get('/', read, validateRequest({ query: listFgBatchesQuerySchema }), controller.list);
router.get('/:fgBatchNo', read, validateRequest({ params: fgBatchNoParamsSchema }), controller.getByNo);

router.post(
  '/:fgBatchNo/transfer',
  movementsWrite,
  validateRequest({ params: fgBatchNoParamsSchema, body: transferFgBatchSchema }),
  controller.transfer,
);
router.patch(
  '/:fgBatchNo/hold',
  movementsWrite,
  validateRequest({ params: fgBatchNoParamsSchema, body: holdFgBatchSchema }),
  controller.hold,
);
router.patch(
  '/:fgBatchNo/release-hold',
  movementsWrite,
  validateRequest({ params: fgBatchNoParamsSchema, body: releaseHoldFgBatchSchema }),
  controller.releaseHold,
);
router.get(
  '/:fgBatchNo/movements',
  movementsRead,
  validateRequest({ params: fgBatchNoParamsSchema, query: listFgMovementsQuerySchema }),
  controller.listMovements,
);

export default router;
