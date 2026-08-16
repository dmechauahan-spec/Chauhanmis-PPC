import { Request, Response, NextFunction } from 'express';
import { sendSuccess } from '../../utils/apiResponse';
import * as qcInspectionService from './qcInspection.service';
import { ListQcInspectionsQuery } from './qcInspection.schema';

export async function create(req: Request, res: Response, next: NextFunction) {
  try {
    const inspection = await qcInspectionService.createQcInspection(req.body);
    sendSuccess(res, inspection, 201);
  } catch (err) {
    next(err);
  }
}

export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await qcInspectionService.listQcInspections(req.query as unknown as ListQcInspectionsQuery);
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
}

export async function getById(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params as unknown as { id: bigint };
    const inspection = await qcInspectionService.getQcInspectionById(id);
    sendSuccess(res, inspection);
  } catch (err) {
    next(err);
  }
}

export async function getSummary(req: Request, res: Response, next: NextFunction) {
  try {
    const summary = await qcInspectionService.getQcInspectionSummary(req.params.orderId);
    sendSuccess(res, summary);
  } catch (err) {
    next(err);
  }
}
