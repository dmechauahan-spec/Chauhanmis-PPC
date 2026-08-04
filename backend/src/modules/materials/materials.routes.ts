import { Router } from 'express';
import { validateRequest } from '../../middleware/validateRequest';
import { authenticate } from '../../middleware/authenticate';
import { authorize } from '../../middleware/authorize';
import { PERMISSIONS } from '../../config/permissions';
import * as controller from './materials.controller';
import { materialsShortageQuerySchema, partIdParamsSchema, setCriticalThresholdSchema } from './materials.schema';

const router = Router();

router.use(authenticate);
const read = authorize(...PERMISSIONS.materials.read);
const write = authorize(...PERMISSIONS.materials.write);

// Static paths before the /:partId catch-all, same convention as every
// other module's routes file.
router.get('/shortages', read, validateRequest({ query: materialsShortageQuerySchema }), controller.shortages);
router.get('/critical', read, controller.critical);
router.get('/summary', read, controller.summary);

router.patch(
  '/:partId/critical-threshold',
  write,
  validateRequest({ params: partIdParamsSchema, body: setCriticalThresholdSchema }),
  controller.setCriticalThreshold,
);
router.get('/:partId', read, validateRequest({ params: partIdParamsSchema }), controller.detail);

export default router;
