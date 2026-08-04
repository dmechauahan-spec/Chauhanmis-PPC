import { Request, Response, NextFunction } from 'express';
import { sendSuccess } from '../../utils/apiResponse';
import * as materialsService from './materials.service';
import { MaterialsShortageQuery, SetCriticalThresholdInput } from './materials.schema';

export async function shortages(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await materialsService.getShortagesByPart(req.query as unknown as MaterialsShortageQuery);
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
}

export async function critical(_req: Request, res: Response, next: NextFunction) {
  try {
    const result = await materialsService.getCriticalParts();
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
}

export async function setCriticalThreshold(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await materialsService.setCriticalThreshold(req.params.partId, req.body as SetCriticalThresholdInput);
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
}

export async function summary(_req: Request, res: Response, next: NextFunction) {
  try {
    const result = await materialsService.getMaterialsSummary();
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
}

export async function detail(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await materialsService.getMaterialDetail(req.params.partId);
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
}
