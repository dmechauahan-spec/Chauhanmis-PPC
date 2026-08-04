import { Router } from 'express';
import { validateRequest } from '../../middleware/validateRequest';
import { authenticate } from '../../middleware/authenticate';
import { authorize } from '../../middleware/authorize';
import { PERMISSIONS } from '../../config/permissions';
import * as controller from './lines.controller';
import {
  createLineSchema,
  lineParamsSchema,
  listLinesQuerySchema,
  updateLineSchema,
} from './lines.schema';

const router = Router();

router.use(authenticate);
const read = authorize(...PERMISSIONS.lines.read);
const write = authorize(...PERMISSIONS.lines.write);

router.get('/', read, validateRequest({ query: listLinesQuerySchema }), controller.list);
router.get('/:lineId', read, validateRequest({ params: lineParamsSchema }), controller.getById);
router.post('/', write, validateRequest({ body: createLineSchema }), controller.create);
router.patch(
  '/:lineId',
  write,
  validateRequest({ params: lineParamsSchema, body: updateLineSchema }),
  controller.update,
);
router.delete('/:lineId', write, validateRequest({ params: lineParamsSchema }), controller.remove);

export default router;
