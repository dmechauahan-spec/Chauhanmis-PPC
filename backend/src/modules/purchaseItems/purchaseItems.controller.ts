import { Request, Response, NextFunction } from 'express';
import { sendSuccess } from '../../utils/apiResponse';
import * as purchaseItemsService from './purchaseItems.service';
import { ListPurchaseItemsQuery } from './purchaseItems.schema';

export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await purchaseItemsService.listPurchaseItems(req.query as unknown as ListPurchaseItemsQuery);
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
}

export async function getByCode(req: Request, res: Response, next: NextFunction) {
  try {
    const item = await purchaseItemsService.getPurchaseItemByCode(req.params.code);
    sendSuccess(res, item);
  } catch (err) {
    next(err);
  }
}

export async function create(req: Request, res: Response, next: NextFunction) {
  try {
    const item = await purchaseItemsService.createPurchaseItem(req.body);
    sendSuccess(res, item, 201);
  } catch (err) {
    next(err);
  }
}

export async function update(req: Request, res: Response, next: NextFunction) {
  try {
    const item = await purchaseItemsService.updatePurchaseItem(req.params.code, req.body);
    sendSuccess(res, item);
  } catch (err) {
    next(err);
  }
}

export async function remove(req: Request, res: Response, next: NextFunction) {
  try {
    await purchaseItemsService.deletePurchaseItem(req.params.code);
    sendSuccess(res, null);
  } catch (err) {
    next(err);
  }
}
