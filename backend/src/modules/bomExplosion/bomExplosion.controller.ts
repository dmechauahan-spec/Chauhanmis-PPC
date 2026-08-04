import { Request, Response, NextFunction } from 'express';
import { sendSuccess } from '../../utils/apiResponse';
import * as bomExplosionService from './bomExplosion.service';
import { SkuExplosionQuery } from './bomExplosion.schema';

export async function explodeSku(req: Request, res: Response, next: NextFunction) {
  try {
    const { qty } = req.query as unknown as SkuExplosionQuery;
    const result = await bomExplosionService.explodeSku(req.params.sku, qty);
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
}

export async function getOrderSnapshot(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await bomExplosionService.getOrComputeOrderBomSnapshot(req.params.orderId);
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
}

export async function recomputeOrderSnapshot(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await bomExplosionService.recomputeOrderBomSnapshot(req.params.orderId);
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
}

export async function deleteOrderSnapshot(req: Request, res: Response, next: NextFunction) {
  try {
    await bomExplosionService.deleteOrderBomSnapshot(req.params.orderId);
    sendSuccess(res, null);
  } catch (err) {
    next(err);
  }
}
