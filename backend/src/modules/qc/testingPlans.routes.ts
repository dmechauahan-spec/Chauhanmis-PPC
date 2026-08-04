import { Router } from 'express';
import { validateRequest } from '../../middleware/validateRequest';
import { authenticate } from '../../middleware/authenticate';
import { authorize } from '../../middleware/authorize';
import { PERMISSIONS } from '../../config/permissions';
import * as controller from './testingPlans.controller';
import {
  createTestingPlanSchema,
  listTestingPlansQuerySchema,
  testingPlanIdParamsSchema,
  updateTestingPlanSchema,
} from './testingPlans.schema';

const router = Router();

router.use(authenticate);
const read = authorize(...PERMISSIONS.qcTestingPlans.read);
// Testing plans are master data, not a floor action — Admin-only write even
// though ProductionManager owns most of the rest of QC (see README "Module 13").
const write = authorize(...PERMISSIONS.qcTestingPlans.write);

router.get('/', read, validateRequest({ query: listTestingPlansQuerySchema }), controller.list);
router.get('/:id', read, validateRequest({ params: testingPlanIdParamsSchema }), controller.getById);
router.post('/', write, validateRequest({ body: createTestingPlanSchema }), controller.create);
router.patch(
  '/:id',
  write,
  validateRequest({ params: testingPlanIdParamsSchema, body: updateTestingPlanSchema }),
  controller.update,
);
router.delete('/:id', write, validateRequest({ params: testingPlanIdParamsSchema }), controller.remove);

export default router;
