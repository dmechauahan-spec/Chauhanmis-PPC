import { Router } from 'express';
import { validateRequest } from '../../middleware/validateRequest';
import { authenticate } from '../../middleware/authenticate';
import { authorize } from '../../middleware/authorize';
import { PERMISSIONS } from '../../config/permissions';
import * as controller from './search.controller';
import { searchQuerySchema } from './search.schema';

const router = Router();

router.use(authenticate);
const read = authorize(...PERMISSIONS.search.read);

router.get('/', read, validateRequest({ query: searchQuerySchema }), controller.search);

export default router;
