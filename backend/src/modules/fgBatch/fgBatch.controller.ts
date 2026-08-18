import { Request, Response, NextFunction } from 'express';
import { sendSuccess } from '../../utils/apiResponse';
import * as fgBatchService from './fgBatch.service';
import { ListFgBatchesQuery } from './fgBatch.schema';

export async function generate(req: Request, res: Response, next: NextFunction) {
  try {
    // createdBy is never client-supplied — same attribution convention as
    // every other write since the auth retrofit (e.g. orders.service.ts's
    // changedBy, qcInspection's inspectorName is the one documented
    // exception, entered by whoever's actually inspecting, not necessarily
    // the logged-in user).
    const batch = await fgBatchService.generateFgBatch(req.body, req.user!.name);
    sendSuccess(res, batch, 201);
  } catch (err) {
    next(err);
  }
}

export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await fgBatchService.listFgBatches(req.query as unknown as ListFgBatchesQuery);
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
}

export async function getByNo(req: Request, res: Response, next: NextFunction) {
  try {
    const batch = await fgBatchService.getFgBatchByNo(req.params.fgBatchNo);
    sendSuccess(res, batch);
  } catch (err) {
    next(err);
  }
}
