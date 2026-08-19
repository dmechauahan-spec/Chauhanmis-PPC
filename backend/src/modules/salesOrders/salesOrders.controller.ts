import { Request, Response, NextFunction } from 'express';
import { sendSuccess } from '../../utils/apiResponse';
import * as salesOrdersService from './salesOrders.service';
import * as fgReservationService from '../fgBatch/fgReservation.service';
import { ListReservationsQuery, ListSalesOrdersQuery } from './salesOrders.schema';

export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await salesOrdersService.listSalesOrders(req.query as unknown as ListSalesOrdersQuery);
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
}

export async function getByNo(req: Request, res: Response, next: NextFunction) {
  try {
    const salesOrder = await salesOrdersService.getSalesOrderByNo(req.params.salesOrderNo);
    sendSuccess(res, salesOrder);
  } catch (err) {
    next(err);
  }
}

export async function create(req: Request, res: Response, next: NextFunction) {
  try {
    const salesOrder = await salesOrdersService.createSalesOrder(req.body, req.user!.name);
    sendSuccess(res, salesOrder, 201);
  } catch (err) {
    next(err);
  }
}

export async function update(req: Request, res: Response, next: NextFunction) {
  try {
    const salesOrder = await salesOrdersService.updateSalesOrder(req.params.salesOrderNo, req.body);
    sendSuccess(res, salesOrder);
  } catch (err) {
    next(err);
  }
}

export async function remove(req: Request, res: Response, next: NextFunction) {
  try {
    await salesOrdersService.deleteSalesOrder(req.params.salesOrderNo);
    sendSuccess(res, null);
  } catch (err) {
    next(err);
  }
}

// GET /api/sales-orders/:salesOrderNo/reservations — the partial-fulfillment
// tracking view; lives on fgReservation.service.ts (see that file) since it
// queries fg_reservations, not sales_orders itself.
export async function listReservations(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await fgReservationService.listReservationsForSalesOrder(
      req.params.salesOrderNo,
      req.query as unknown as ListReservationsQuery,
    );
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
}
