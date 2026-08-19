import { Router } from 'express';
import { validateRequest } from '../../middleware/validateRequest';
import { authenticate } from '../../middleware/authenticate';
import { authorize } from '../../middleware/authorize';
import { PERMISSIONS } from '../../config/permissions';
import * as controller from './salesOrders.controller';
import {
  createSalesOrderSchema,
  listReservationsQuerySchema,
  listSalesOrdersQuerySchema,
  salesOrderNoParamsSchema,
  updateSalesOrderSchema,
} from './salesOrders.schema';

const router = Router();

router.use(authenticate);
const read = authorize(...PERMISSIONS.salesOrders.read);
const write = authorize(...PERMISSIONS.salesOrders.write);
// FG Module Part 3 — reservations are inventory/warehouse territory, same
// StoreManager-write split as fgStockMovements — see README "FG Module
// Part 3". This is a read of fg_reservations scoped by Sales Order, not a
// write on the Sales Order itself, so it uses fgReservations.read, not
// salesOrders.read (both currently STORE_AND_PRODUCTION, but kept as
// distinct permission entries in case that ever diverges).
const reservationsRead = authorize(...PERMISSIONS.fgReservations.read);

router.get('/', read, validateRequest({ query: listSalesOrdersQuerySchema }), controller.list);
router.get('/:salesOrderNo', read, validateRequest({ params: salesOrderNoParamsSchema }), controller.getByNo);
router.post('/', write, validateRequest({ body: createSalesOrderSchema }), controller.create);
router.patch(
  '/:salesOrderNo',
  write,
  validateRequest({ params: salesOrderNoParamsSchema, body: updateSalesOrderSchema }),
  controller.update,
);
router.delete('/:salesOrderNo', write, validateRequest({ params: salesOrderNoParamsSchema }), controller.remove);

router.get(
  '/:salesOrderNo/reservations',
  reservationsRead,
  validateRequest({ params: salesOrderNoParamsSchema, query: listReservationsQuerySchema }),
  controller.listReservations,
);

export default router;
