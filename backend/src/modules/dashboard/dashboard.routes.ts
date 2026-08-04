import { Router } from 'express';
import { validateRequest } from '../../middleware/validateRequest';
import { authenticate } from '../../middleware/authenticate';
import { authorize } from '../../middleware/authorize';
import { PERMISSIONS } from '../../config/permissions';
import * as controller from './dashboard.controller';
import { managementQuerySchema, overviewQuerySchema, productionQuerySchema } from './dashboard.schema';

const router = Router();

router.use(authenticate);
const read = authorize(...PERMISSIONS.dashboard.read);

router.get('/production', read, validateRequest({ query: productionQuerySchema }), controller.production);
router.get('/planning', read, controller.planning);
router.get('/materials', read, controller.materials);
router.get('/management', read, validateRequest({ query: managementQuerySchema }), controller.management);
router.get('/overview', read, validateRequest({ query: overviewQuerySchema }), controller.overview);

export default router;
