import { Router } from 'express';
import { validateRequest } from '../../middleware/validateRequest';
import { authenticate } from '../../middleware/authenticate';
import { authorize } from '../../middleware/authorize';
import { PERMISSIONS } from '../../config/permissions';
import * as controller from './dailyLogs.controller';
import {
  createDailyLogSchema,
  downtimeEntryInputSchema,
  downtimeIdParamsSchema,
  downtimeSummaryQuerySchema,
  listDailyLogsQuerySchema,
  logIdParamsSchema,
  updateDailyLogSchema,
} from './dailyLogs.schema';

// Downtime is a tightly-scoped sub-resource of a daily log (no lifecycle of
// its own outside a parent log), so its routes/handlers live alongside the
// daily log's rather than in a separate downtime.routes.ts file — see README.
const router = Router();

router.use(authenticate);
const read = authorize(...PERMISSIONS.dailyLogs.read);
const write = authorize(...PERMISSIONS.dailyLogs.write);

router.get(
  '/summary/downtime-by-reason',
  read,
  validateRequest({ query: downtimeSummaryQuerySchema }),
  controller.downtimeSummary,
);

router.get('/', read, validateRequest({ query: listDailyLogsQuerySchema }), controller.list);
router.get('/:logId', read, validateRequest({ params: logIdParamsSchema }), controller.getById);
router.get(
  '/:logId/downtime',
  read,
  validateRequest({ params: logIdParamsSchema }),
  controller.listDowntime,
);

router.post('/', write, validateRequest({ body: createDailyLogSchema }), controller.create);
router.post(
  '/:logId/downtime',
  write,
  validateRequest({ params: logIdParamsSchema, body: downtimeEntryInputSchema }),
  controller.addDowntime,
);

router.patch(
  '/:logId',
  write,
  validateRequest({ params: logIdParamsSchema, body: updateDailyLogSchema }),
  controller.update,
);

router.delete(
  '/:logId/downtime/:downtimeId',
  write,
  validateRequest({ params: downtimeIdParamsSchema }),
  controller.removeDowntime,
);

export default router;
