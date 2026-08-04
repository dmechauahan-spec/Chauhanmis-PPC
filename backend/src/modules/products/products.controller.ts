import { Request, Response, NextFunction } from 'express';
import { sendSuccess } from '../../utils/apiResponse';
import * as productsService from './products.service';
import { ListProductsQuery } from './products.schema';

export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await productsService.listProducts(req.query as unknown as ListProductsQuery);
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
}

export async function getById(req: Request, res: Response, next: NextFunction) {
  try {
    const product = await productsService.getProductById(req.params.modelId);
    sendSuccess(res, product);
  } catch (err) {
    next(err);
  }
}

export async function create(req: Request, res: Response, next: NextFunction) {
  try {
    const product = await productsService.createProduct(req.body);
    sendSuccess(res, product, 201);
  } catch (err) {
    next(err);
  }
}

export async function update(req: Request, res: Response, next: NextFunction) {
  try {
    const product = await productsService.updateProduct(req.params.modelId, req.body);
    sendSuccess(res, product);
  } catch (err) {
    next(err);
  }
}

export async function remove(req: Request, res: Response, next: NextFunction) {
  try {
    await productsService.deleteProduct(req.params.modelId);
    sendSuccess(res, null);
  } catch (err) {
    next(err);
  }
}
