import { Request, Response, NextFunction } from 'express';
import { sendSuccess } from '../../utils/apiResponse';
import * as oeeService from './oee.service';
import { downtimeByReason } from '../dailyLogs/dailyLogs.service';
import { DowntimeSummaryQuery } from '../dailyLogs/dailyLogs.schema';
import { OeeDateRangeQuery, OeeListQuery } from './oee.schema';

export async function getForLog(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await oeeService.getOeeForLog(req.params.logId);
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
}

export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await oeeService.listOee(req.query as unknown as OeeListQuery);
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
}

export async function summary(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await oeeService.getOeeSummary(req.query as unknown as OeeDateRangeQuery);
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
}

export async function byLine(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await oeeService.getOeeByLine(req.query as unknown as OeeDateRangeQuery);
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
}

// Thin re-export of Module 3's downtime-by-reason aggregation (see
// dailyLogs.service.ts) so OEE dashboards can discover it under /api/oee
// alongside the metrics above, without duplicating the groupBy query.
export async function downtimeByReasonAlias(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await downtimeByReason(req.query as unknown as DowntimeSummaryQuery);
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
}
