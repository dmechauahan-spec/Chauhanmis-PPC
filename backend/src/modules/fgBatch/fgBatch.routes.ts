import { Router } from 'express';
import { validateRequest } from '../../middleware/validateRequest';
import { authenticate } from '../../middleware/authenticate';
import { authorize } from '../../middleware/authorize';
import { PERMISSIONS } from '../../config/permissions';
import * as controller from './fgBatch.controller';
import { fgBatchNoParamsSchema, generateFgBatchSchema, listFgBatchesQuerySchema } from './fgBatch.schema';

const router = Router();

router.use(authenticate);
const read = authorize(...PERMISSIONS.fgBatch.read);
const write = authorize(...PERMISSIONS.fgBatch.write);

router.post('/generate', write, validateRequest({ body: generateFgBatchSchema }), controller.generate);
router.get('/', read, validateRequest({ query: listFgBatchesQuerySchema }), controller.list);
router.get('/:fgBatchNo', read, validateRequest({ params: fgBatchNoParamsSchema }), controller.getByNo);

export default router;
