import { Router } from 'express';
import { validateRequest } from '../../middleware/validateRequest';
import { authenticate } from '../../middleware/authenticate';
import { authorize } from '../../middleware/authorize';
import { PERMISSIONS } from '../../config/permissions';
import * as controller from './qc.controller';
import { batchNumberParamsSchema, listQcBatchesQuerySchema } from './qc.schema';
import testingPlansRouter from './testingPlans.routes';

const router = Router();

// Testing plans are genuinely master data (see README "Module 13") but live
// alongside QC batches in this same module folder rather than a separate
// src/modules/testingPlans/ — mounted here as its own sub-router so the two
// concerns stay in distinct files without scattering across folders.
// testingPlansRouter carries its own authenticate/authorize chain (it's also
// exercised standalone in testingPlans.test.ts), so nothing extra is needed here.
router.use('/testing-plans', testingPlansRouter);

router.use(authenticate);
const read = authorize(...PERMISSIONS.qcBatches.read);
const write = authorize(...PERMISSIONS.qcBatches.write);

router.post('/generate', write, controller.generate);

router.get('/batches', read, validateRequest({ query: listQcBatchesQuerySchema }), controller.list);
router.get(
  '/batches/:batchNumber',
  read,
  validateRequest({ params: batchNumberParamsSchema }),
  controller.getByBatchNumber,
);

export default router;
