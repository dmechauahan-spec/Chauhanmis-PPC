import { Request, Response, NextFunction } from 'express';
import { sendSuccess } from '../../utils/apiResponse';
import * as suppliersService from './suppliers.service';
import { ListSuppliersQuery } from './suppliers.schema';

export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await suppliersService.listSuppliers(req.query as unknown as ListSuppliersQuery);
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
}

export async function getByCode(req: Request, res: Response, next: NextFunction) {
  try {
    const supplier = await suppliersService.getSupplierByCode(req.params.code);
    sendSuccess(res, supplier);
  } catch (err) {
    next(err);
  }
}

export async function create(req: Request, res: Response, next: NextFunction) {
  try {
    const supplier = await suppliersService.createSupplier(req.body);
    sendSuccess(res, supplier, 201);
  } catch (err) {
    next(err);
  }
}

export async function update(req: Request, res: Response, next: NextFunction) {
  try {
    const supplier = await suppliersService.updateSupplier(req.params.code, req.body);
    sendSuccess(res, supplier);
  } catch (err) {
    next(err);
  }
}

export async function remove(req: Request, res: Response, next: NextFunction) {
  try {
    await suppliersService.deleteSupplier(req.params.code);
    sendSuccess(res, null);
  } catch (err) {
    next(err);
  }
}
