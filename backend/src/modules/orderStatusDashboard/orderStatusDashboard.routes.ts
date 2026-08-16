import { Router } from 'express';
import { validateRequest } from '../../middleware/validateRequest';
import { authenticate } from '../../middleware/authenticate';
import { authorize } from '../../middleware/authorize';
import { PERMISSIONS } from '../../config/permissions';
import * as controller from './orderStatusDashboard.controller';
import { listOrderStatusDashboardQuerySchema } from './orderStatusDashboard.schema';

const router = Router();

router.use(authenticate);
const read = authorize(...PERMISSIONS.orderStatusDashboard.read);

router.get('/', read, validateRequest({ query: listOrderStatusDashboardQuerySchema }), controller.list);

export default router;
