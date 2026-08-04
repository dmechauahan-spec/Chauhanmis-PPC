import { Request, Response, NextFunction } from 'express';
import { sendSuccess } from '../../utils/apiResponse';
import * as qcService from './qc.service';
import { ListQcBatchesQuery } from './qc.schema';

export async function generate(_req: Request, res: Response, next: NextFunction) {
  try {
    const result = await qcService.generateQcBatches();
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
}

export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await qcService.listQcBatches(req.query as unknown as ListQcBatchesQuery);
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
}

export async function getByBatchNumber(req: Request, res: Response, next: NextFunction) {
  try {
    const batch = await qcService.getQcBatchByNumber(req.params.batchNumber);
    sendSuccess(res, batch);
  } catch (err) {
    next(err);
  }
}
