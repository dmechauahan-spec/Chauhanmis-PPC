import { Router } from 'express';
import { validateRequest } from '../../middleware/validateRequest';
import { authenticate } from '../../middleware/authenticate';
import { authorize } from '../../middleware/authorize';
import { PERMISSIONS } from '../../config/permissions';
import * as controller from './bom.controller';
import {
  bomIdParamsSchema,
  bulkImportBomSchema,
  createBomComponentSchema,
  modelRefParamsSchema,
  updateBomComponentSchema,
} from './bom.schema';

const router = Router();

router.use(authenticate);
const read = authorize(...PERMISSIONS.bom.read);
const write = authorize(...PERMISSIONS.bom.write);

router.get(
  '/model/:modelRef',
  read,
  validateRequest({ params: modelRefParamsSchema }),
  controller.getByModelRef,
);
router.post('/bulk', write, validateRequest({ body: bulkImportBomSchema }), controller.bulkImport);
router.post('/', write, validateRequest({ body: createBomComponentSchema }), controller.create);
router.patch(
  '/:id',
  write,
  validateRequest({ params: bomIdParamsSchema, body: updateBomComponentSchema }),
  controller.update,
);
router.delete('/:id', write, validateRequest({ params: bomIdParamsSchema }), controller.remove);

export default router;
