import { Request, Response, NextFunction } from 'express';
import { sendSuccess } from '../../utils/apiResponse';
import * as purchaseOrdersService from './purchaseOrders.service';
import { ListPurchaseOrdersQuery } from './purchaseOrders.schema';

export async function create(req: Request, res: Response, next: NextFunction) {
  try {
    const po = await purchaseOrdersService.createPurchaseOrder(req.body, req.user!.name);
    sendSuccess(res, po, 201);
  } catch (err) {
    next(err);
  }
}

export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await purchaseOrdersService.listPurchaseOrders(req.query as unknown as ListPurchaseOrdersQuery);
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
}

export async function getByNumber(req: Request, res: Response, next: NextFunction) {
  try {
    const { poNumber } = req.params as unknown as { poNumber: string };
    const po = await purchaseOrdersService.getPurchaseOrderByNumber(poNumber);
    sendSuccess(res, po);
  } catch (err) {
    next(err);
  }
}

export async function updateStatus(req: Request, res: Response, next: NextFunction) {
  try {
    const { poNumber } = req.params as unknown as { poNumber: string };
    const po = await purchaseOrdersService.updatePurchaseOrderStatus(poNumber, req.body, req.user!.name);
    sendSuccess(res, po);
  } catch (err) {
    next(err);
  }
}

export async function amend(req: Request, res: Response, next: NextFunction) {
  try {
    const { poNumber } = req.params as unknown as { poNumber: string };
    const po = await purchaseOrdersService.amendPurchaseOrder(poNumber, req.body, req.user!.name);
    sendSuccess(res, po);
  } catch (err) {
    next(err);
  }
}
