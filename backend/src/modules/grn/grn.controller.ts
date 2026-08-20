import { Request, Response, NextFunction } from 'express';
import { sendSuccess } from '../../utils/apiResponse';
import * as grnService from './grn.service';
import { ListGrnsQuery } from './grn.schema';

export async function create(req: Request, res: Response, next: NextFunction) {
  try {
    const grn = await grnService.createGrn(req.body, req.user!.name);
    sendSuccess(res, grn, 201);
  } catch (err) {
    next(err);
  }
}

export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await grnService.listGrns(req.query as unknown as ListGrnsQuery);
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
}

export async function getByNumber(req: Request, res: Response, next: NextFunction) {
  try {
    const { grnNo } = req.params as unknown as { grnNo: string };
    const grn = await grnService.getGrnByNumber(grnNo);
    sendSuccess(res, grn);
  } catch (err) {
    next(err);
  }
}

export async function qcInspect(req: Request, res: Response, next: NextFunction) {
  try {
    const { grnNo, id } = req.params as unknown as { grnNo: string; id: bigint };
    const grnLineItem = await grnService.inspectGrnLineItem(grnNo, id, req.body, req.user!.name);
    sendSuccess(res, grnLineItem);
  } catch (err) {
    next(err);
  }
}
