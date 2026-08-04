import { Router } from 'express';
import { validateRequest } from '../../middleware/validateRequest';
import { authenticate } from '../../middleware/authenticate';
import { authorize } from '../../middleware/authorize';
import { PERMISSIONS } from '../../config/permissions';
import * as controller from './shortageReport.controller';
import { orderIdParamsSchema, shortageReportQuerySchema } from './shortageReport.schema';

const router = Router();

router.use(authenticate);
// Read-only module — every route uses the read list, there is no write list.
const read = authorize(...PERMISSIONS.shortageReport.read);

router.get('/orders', read, validateRequest({ query: shortageReportQuerySchema }), controller.list);
router.get('/orders/:orderId', read, validateRequest({ params: orderIdParamsSchema }), controller.detail);

export default router;
