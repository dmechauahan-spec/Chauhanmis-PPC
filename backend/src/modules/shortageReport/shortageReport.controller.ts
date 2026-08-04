import { Request, Response, NextFunction } from 'express';
import { sendSuccess } from '../../utils/apiResponse';
import * as shortageReportService from './shortageReport.service';
import { ShortageReportQuery } from './shortageReport.schema';

export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await shortageReportService.getShortageReport(req.query as unknown as ShortageReportQuery);
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
}

export async function detail(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await shortageReportService.getShortageReportForOrder(req.params.orderId);
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
}
