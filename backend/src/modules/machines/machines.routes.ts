import { Router } from 'express';
import { validateRequest } from '../../middleware/validateRequest';
import { authenticate } from '../../middleware/authenticate';
import { authorize } from '../../middleware/authorize';
import { PERMISSIONS } from '../../config/permissions';
import * as controller from './machines.controller';
import {
  createMachineSchema,
  listMachinesQuerySchema,
  machineParamsSchema,
  updateMachineSchema,
} from './machines.schema';

const router = Router();

router.use(authenticate);
const read = authorize(...PERMISSIONS.machines.read);
const write = authorize(...PERMISSIONS.machines.write);

router.get('/', read, validateRequest({ query: listMachinesQuerySchema }), controller.list);
router.get(
  '/:machineId',
  read,
  validateRequest({ params: machineParamsSchema }),
  controller.getById,
);
router.post('/', write, validateRequest({ body: createMachineSchema }), controller.create);
router.patch(
  '/:machineId',
  write,
  validateRequest({ params: machineParamsSchema, body: updateMachineSchema }),
  controller.update,
);
router.delete(
  '/:machineId',
  write,
  validateRequest({ params: machineParamsSchema }),
  controller.remove,
);

export default router;
