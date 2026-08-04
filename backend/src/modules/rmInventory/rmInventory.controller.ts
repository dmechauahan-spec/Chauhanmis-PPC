import { Request, Response, NextFunction } from 'express';
import { sendSuccess } from '../../utils/apiResponse';
import * as rmInventoryService from './rmInventory.service';
import { ListRmInventoryQuery } from './rmInventory.schema';

export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await rmInventoryService.listRmInventory(
      req.query as unknown as ListRmInventoryQuery,
    );
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
}

export async function getById(req: Request, res: Response, next: NextFunction) {
  try {
    const part = await rmInventoryService.getRmInventoryById(req.params.partId);
    sendSuccess(res, part);
  } catch (err) {
    next(err);
  }
}

export async function create(req: Request, res: Response, next: NextFunction) {
  try {
    const part = await rmInventoryService.createRmInventory(req.body);
    sendSuccess(res, part, 201);
  } catch (err) {
    next(err);
  }
}

export async function update(req: Request, res: Response, next: NextFunction) {
  try {
    const part = await rmInventoryService.updateRmInventory(req.params.partId, req.body);
    sendSuccess(res, part);
  } catch (err) {
    next(err);
  }
}

export async function remove(req: Request, res: Response, next: NextFunction) {
  try {
    await rmInventoryService.deleteRmInventory(req.params.partId);
    sendSuccess(res, null);
  } catch (err) {
    next(err);
  }
}

export async function adjustStock(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await rmInventoryService.adjustStock(req.params.partId, req.body);
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
}

export async function listTransactions(req: Request, res: Response, next: NextFunction) {
  try {
    const transactions = await rmInventoryService.listRmTransactions(req.params.partId);
    sendSuccess(res, transactions);
  } catch (err) {
    next(err);
  }
}
