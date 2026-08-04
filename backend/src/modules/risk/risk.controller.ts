import { Request, Response, NextFunction } from 'express';
import { sendSuccess } from '../../utils/apiResponse';
import * as riskService from './risk.service';
import { ListAtRiskOrdersQuery } from './risk.schema';

export async function listAtRisk(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await riskService.listAtRiskOrders(req.query as unknown as ListAtRiskOrdersQuery);
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
}

export async function getRecommendations(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await riskService.getRiskRecommendationsForOrder(req.params.orderId);
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
}

export async function summary(_req: Request, res: Response, next: NextFunction) {
  try {
    const result = await riskService.getRiskSummary();
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
}
