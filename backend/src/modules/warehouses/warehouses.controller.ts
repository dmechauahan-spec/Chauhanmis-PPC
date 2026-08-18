import { Request, Response, NextFunction } from 'express';
import { sendSuccess } from '../../utils/apiResponse';
import * as warehousesService from './warehouses.service';
import { ListWarehousesQuery } from './warehouses.schema';

export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await warehousesService.listWarehouses(req.query as unknown as ListWarehousesQuery);
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
}

export async function getById(req: Request, res: Response, next: NextFunction) {
  try {
    const warehouse = await warehousesService.getWarehouseById(req.params.warehouseId);
    sendSuccess(res, warehouse);
  } catch (err) {
    next(err);
  }
}

export async function create(req: Request, res: Response, next: NextFunction) {
  try {
    const warehouse = await warehousesService.createWarehouse(req.body);
    sendSuccess(res, warehouse, 201);
  } catch (err) {
    next(err);
  }
}

export async function update(req: Request, res: Response, next: NextFunction) {
  try {
    const warehouse = await warehousesService.updateWarehouse(req.params.warehouseId, req.body);
    sendSuccess(res, warehouse);
  } catch (err) {
    next(err);
  }
}

export async function remove(req: Request, res: Response, next: NextFunction) {
  try {
    await warehousesService.deleteWarehouse(req.params.warehouseId);
    sendSuccess(res, null);
  } catch (err) {
    next(err);
  }
}
