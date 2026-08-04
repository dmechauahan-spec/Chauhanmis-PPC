import { Request, Response, NextFunction } from 'express';
import { sendSuccess } from '../../utils/apiResponse';
import * as dailyLogsService from './dailyLogs.service';
import { DowntimeSummaryQuery, ListDailyLogsQuery } from './dailyLogs.schema';

export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await dailyLogsService.listDailyLogs(req.query as unknown as ListDailyLogsQuery);
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
}

export async function getById(req: Request, res: Response, next: NextFunction) {
  try {
    const log = await dailyLogsService.getDailyLogById(req.params.logId);
    sendSuccess(res, log);
  } catch (err) {
    next(err);
  }
}

export async function create(req: Request, res: Response, next: NextFunction) {
  try {
    const log = await dailyLogsService.createDailyLog(req.body, req.user!.name);
    sendSuccess(res, log, 201);
  } catch (err) {
    next(err);
  }
}

export async function update(req: Request, res: Response, next: NextFunction) {
  try {
    const log = await dailyLogsService.updateDailyLog(req.params.logId, req.body, req.user!.name);
    sendSuccess(res, log);
  } catch (err) {
    next(err);
  }
}

export async function listDowntime(req: Request, res: Response, next: NextFunction) {
  try {
    const entries = await dailyLogsService.listDowntimeEntries(req.params.logId);
    sendSuccess(res, entries);
  } catch (err) {
    next(err);
  }
}

export async function addDowntime(req: Request, res: Response, next: NextFunction) {
  try {
    const entry = await dailyLogsService.addDowntimeEntry(req.params.logId, req.body);
    sendSuccess(res, entry, 201);
  } catch (err) {
    next(err);
  }
}

export async function removeDowntime(req: Request, res: Response, next: NextFunction) {
  try {
    const { logId, downtimeId } = req.params as unknown as { logId: string; downtimeId: bigint };
    await dailyLogsService.removeDowntimeEntry(logId, downtimeId);
    sendSuccess(res, null);
  } catch (err) {
    next(err);
  }
}

export async function downtimeSummary(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await dailyLogsService.downtimeByReason(req.query as unknown as DowntimeSummaryQuery);
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
}
