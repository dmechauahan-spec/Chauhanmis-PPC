import { Router } from 'express';
import { validateRequest } from '../../middleware/validateRequest';
import { authenticate } from '../../middleware/authenticate';
import { authorize } from '../../middleware/authorize';
import { PERMISSIONS } from '../../config/permissions';
import { downtimeSummaryQuerySchema, logIdParamsSchema } from '../dailyLogs/dailyLogs.schema';
import * as controller from './oee.controller';
import { oeeDateRangeQuerySchema, oeeListQuerySchema } from './oee.schema';

const router = Router();

router.use(authenticate);
// Read-only module — every route uses the read list, there is no write list.
const read = authorize(...PERMISSIONS.oee.read);

// Static paths before the /:logId catch-all, same convention as dailyLogs.routes.ts.
router.get('/summary', read, validateRequest({ query: oeeDateRangeQuerySchema }), controller.summary);
router.get('/by-line', read, validateRequest({ query: oeeDateRangeQuerySchema }), controller.byLine);
router.get(
  '/downtime-by-reason',
  read,
  validateRequest({ query: downtimeSummaryQuerySchema }),
  controller.downtimeByReasonAlias,
);

router.get('/', read, validateRequest({ query: oeeListQuerySchema }), controller.list);
router.get('/:logId', read, validateRequest({ params: logIdParamsSchema }), controller.getForLog);

export default router;
