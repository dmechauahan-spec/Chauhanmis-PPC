import { Request, Response, NextFunction } from 'express';
import { sendSuccess } from '../../utils/apiResponse';
import * as orderStatusDashboardService from './orderStatusDashboard.service';
import { ListOrderStatusDashboardQuery } from './orderStatusDashboard.schema';

export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await orderStatusDashboardService.listOrderStatusDashboard(
      req.query as unknown as ListOrderStatusDashboardQuery,
    );
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
}
