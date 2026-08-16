import { Router } from 'express';
import { validateRequest } from '../../middleware/validateRequest';
import { authenticate } from '../../middleware/authenticate';
import { authorize } from '../../middleware/authorize';
import { PERMISSIONS } from '../../config/permissions';
import * as controller from './qcInspection.controller';
import {
  createQcInspectionSchema,
  idParamsSchema,
  listQcInspectionsQuerySchema,
  orderIdParamsSchema,
} from './qcInspection.schema';

// Client Flow Part 3 — Daily QC Inspection (daily pass/reject/rework
// tracking). Distinct from Module 13's /api/qc (QcBatch traceability) — see
// README "QC Batches vs. QC Inspections". Deliberately its own top-level
// prefix, /api/qc-inspections, not nested under /api/qc.
const router = Router();

router.use(authenticate);
const read = authorize(...PERMISSIONS.qcInspections.read);
const write = authorize(...PERMISSIONS.qcInspections.write);

router.get(
  '/summary/:orderId',
  read,
  validateRequest({ params: orderIdParamsSchema }),
  controller.getSummary,
);

router.get('/', read, validateRequest({ query: listQcInspectionsQuerySchema }), controller.list);
router.get('/:id', read, validateRequest({ params: idParamsSchema }), controller.getById);
router.post('/', write, validateRequest({ body: createQcInspectionSchema }), controller.create);

export default router;
