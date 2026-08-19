import { Router } from 'express';
import { validateRequest } from '../../middleware/validateRequest';
import { authenticate } from '../../middleware/authenticate';
import { authorize } from '../../middleware/authorize';
import { PERMISSIONS } from '../../config/permissions';
import * as controller from './fgReservation.controller';
import { fgReservationIdParamsSchema } from './fgBatch.schema';

// FG Module Part 3 — mounted at /api/fg-reservations (see app.ts), separate
// from /api/fg-batches even though the underlying service lives alongside
// fgBatch's own — the FgReservation entity has its own id-addressed
// resource path, distinct from the fg-batches/:fgBatchNo/reserve action
// that creates one.
const router = Router();

router.use(authenticate);
const write = authorize(...PERMISSIONS.fgReservations.write);

router.post('/:id/cancel', write, validateRequest({ params: fgReservationIdParamsSchema }), controller.cancel);

export default router;
