import { Request, Response, NextFunction } from 'express';
import { sendSuccess } from '../../utils/apiResponse';
import * as schedulingService from './scheduling.service';
import { ListScheduleQuery } from './scheduling.schema';

export async function run(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await schedulingService.runScheduling(req.body);
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
}

export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await schedulingService.listSchedule(req.query as unknown as ListScheduleQuery);
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
}

export async function getByOrderId(req: Request, res: Response, next: NextFunction) {
  try {
    const row = await schedulingService.getScheduleForOrder(req.params.orderId);
    sendSuccess(res, row);
  } catch (err) {
    next(err);
  }
}

export async function unschedule(req: Request, res: Response, next: NextFunction) {
  try {
    await schedulingService.unscheduleOrder(req.params.orderId, req.body, req.user!.name);
    sendSuccess(res, null);
  } catch (err) {
    next(err);
  }
}
