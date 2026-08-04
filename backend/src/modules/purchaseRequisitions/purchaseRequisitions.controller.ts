import { Request, Response, NextFunction } from 'express';
import { sendSuccess } from '../../utils/apiResponse';
import * as prService from './purchaseRequisitions.service';
import { ListPrQuery } from './purchaseRequisitions.schema';

export async function generate(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await prService.generatePurchaseRequisition(req.body, req.user!.name);
    sendSuccess(res, result, result.created ? 201 : 200);
  } catch (err) {
    next(err);
  }
}

export async function updateStatus(req: Request, res: Response, next: NextFunction) {
  try {
    const { prId } = req.params as unknown as { prId: bigint };
    const result = await prService.updatePrStatus(prId, req.body, req.user!.name);
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
}

export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await prService.listPurchaseRequisitions(req.query as unknown as ListPrQuery);
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
}

export async function getById(req: Request, res: Response, next: NextFunction) {
  try {
    const { prId } = req.params as unknown as { prId: bigint };
    const pr = await prService.getPurchaseRequisitionById(prId);
    sendSuccess(res, pr);
  } catch (err) {
    next(err);
  }
}
