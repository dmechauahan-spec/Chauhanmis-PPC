import { Request, Response, NextFunction } from 'express';
import { sendSuccess } from '../../utils/apiResponse';
import * as productionPlanService from './productionPlan.service';

export async function generate(req: Request, res: Response, next: NextFunction) {
  try {
    const plan = await productionPlanService.generateProductionPlan(req.params.orderId);
    sendSuccess(res, plan, 201);
  } catch (err) {
    next(err);
  }
}

export async function getByOrderId(req: Request, res: Response, next: NextFunction) {
  try {
    const plan = await productionPlanService.getProductionPlan(req.params.orderId);
    sendSuccess(res, plan);
  } catch (err) {
    next(err);
  }
}

export async function getPlanVsActual(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await productionPlanService.getPlanVsActual(req.params.orderId);
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
}
