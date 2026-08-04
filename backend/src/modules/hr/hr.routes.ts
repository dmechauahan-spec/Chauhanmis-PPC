import { Router } from 'express';
import { validateRequest } from '../../middleware/validateRequest';
import { authenticate } from '../../middleware/authenticate';
import { authorize } from '../../middleware/authorize';
import { PERMISSIONS } from '../../config/permissions';
import * as controller from './hr.controller';
import {
  createHrTeamSchema,
  listHrTeamsQuerySchema,
  teamParamsSchema,
  updateHrTeamSchema,
} from './hr.schema';

const router = Router();

router.use(authenticate);
const read = authorize(...PERMISSIONS.hrTeams.read);
const write = authorize(...PERMISSIONS.hrTeams.write);

router.get('/', read, validateRequest({ query: listHrTeamsQuerySchema }), controller.list);
router.get('/:teamId', read, validateRequest({ params: teamParamsSchema }), controller.getById);
router.post('/', write, validateRequest({ body: createHrTeamSchema }), controller.create);
router.patch(
  '/:teamId',
  write,
  validateRequest({ params: teamParamsSchema, body: updateHrTeamSchema }),
  controller.update,
);
router.delete('/:teamId', write, validateRequest({ params: teamParamsSchema }), controller.remove);

export default router;
