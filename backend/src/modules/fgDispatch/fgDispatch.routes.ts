import { Router } from 'express';
import { validateRequest } from '../../middleware/validateRequest';
import { authenticate } from '../../middleware/authenticate';
import { authorize } from '../../middleware/authorize';
import { PERMISSIONS } from '../../config/permissions';
import * as controller from './fgDispatch.controller';
import { createDispatchSchema, dispatchNoParamsSchema, listDispatchesQuerySchema } from './fgDispatch.schema';

const router = Router();

router.use(authenticate);
const read = authorize(...PERMISSIONS.fgDispatches.read);
const write = authorize(...PERMISSIONS.fgDispatches.write);

router.post('/', write, validateRequest({ body: createDispatchSchema }), controller.create);
router.get('/', read, validateRequest({ query: listDispatchesQuerySchema }), controller.list);
router.get('/:dispatchNo', read, validateRequest({ params: dispatchNoParamsSchema }), controller.getByNo);

export default router;
