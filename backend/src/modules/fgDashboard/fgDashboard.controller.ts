import { Request, Response, NextFunction } from 'express';
import { sendSuccess } from '../../utils/apiResponse';
import * as fgDashboardService from './fgDashboard.service';
import { FgDashboardQuery } from './fgDashboard.schema';

export async function summary(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await fgDashboardService.getFgDashboardSummary(req.query as unknown as FgDashboardQuery);
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
}

export async function trace(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await fgDashboardService.getFgBatchTrace(req.params.fgBatchNo);
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
}
