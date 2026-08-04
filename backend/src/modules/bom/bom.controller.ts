import { Request, Response, NextFunction } from 'express';
import { sendSuccess } from '../../utils/apiResponse';
import * as bomService from './bom.service';

export async function getByModelRef(req: Request, res: Response, next: NextFunction) {
  try {
    const items = await bomService.getBomByModelRef(req.params.modelRef);
    sendSuccess(res, items);
  } catch (err) {
    next(err);
  }
}

export async function create(req: Request, res: Response, next: NextFunction) {
  try {
    const component = await bomService.createBomComponent(req.body);
    sendSuccess(res, component, 201);
  } catch (err) {
    next(err);
  }
}

export async function update(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params as unknown as { id: bigint };
    const component = await bomService.updateBomComponent(id, req.body);
    sendSuccess(res, component);
  } catch (err) {
    next(err);
  }
}

export async function remove(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params as unknown as { id: bigint };
    await bomService.deleteBomComponent(id);
    sendSuccess(res, null);
  } catch (err) {
    next(err);
  }
}

export async function bulkImport(req: Request, res: Response, next: NextFunction) {
  try {
    const items = await bomService.bulkImportBom(req.body);
    sendSuccess(res, items, 201);
  } catch (err) {
    next(err);
  }
}
