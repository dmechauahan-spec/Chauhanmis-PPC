import { Request, Response, NextFunction } from 'express';
import { sendSuccess } from '../../utils/apiResponse';
import * as ctbService from './ctb.service';
import { CtbDashboardQuery } from './ctb.schema';

export async function getForOrder(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await ctbService.getCtbForOrder(req.params.orderId);
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
}

export async function recheckForOrder(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await ctbService.recheckCtbForOrder(req.params.orderId);
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
}

export async function dashboard(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await ctbService.getCtbDashboard(req.query as unknown as CtbDashboardQuery);
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
}

export async function recheckAll(_req: Request, res: Response, next: NextFunction) {
  try {
    const result = await ctbService.recheckAllCtb();
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
}
