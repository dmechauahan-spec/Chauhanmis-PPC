import { Request, Response, NextFunction } from 'express';
import { sendSuccess } from '../../utils/apiResponse';
import * as dashboardService from './dashboard.service';
import { ManagementQuery, OverviewQuery, ProductionQuery } from './dashboard.schema';

export async function production(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await dashboardService.getProductionOverTime(req.query as unknown as ProductionQuery);
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
}

export async function planning(_req: Request, res: Response, next: NextFunction) {
  try {
    const result = await dashboardService.getPlanningHealth();
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
}

export async function materials(_req: Request, res: Response, next: NextFunction) {
  try {
    const result = await dashboardService.getMaterialsHealth();
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
}

export async function management(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await dashboardService.getManagementMetrics(req.query as unknown as ManagementQuery);
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
}

export async function overview(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await dashboardService.getDashboardOverview(req.query as unknown as OverviewQuery);
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
}
