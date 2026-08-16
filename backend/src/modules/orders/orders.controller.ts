import { Request, Response, NextFunction } from 'express';
import { sendSuccess } from '../../utils/apiResponse';
import * as ordersService from './orders.service';
import { ListOrdersQuery } from './orders.schema';

export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await ordersService.listOrders(req.query as unknown as ListOrdersQuery);
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
}

export async function getById(req: Request, res: Response, next: NextFunction) {
  try {
    const order = await ordersService.getOrderById(req.params.orderId);
    sendSuccess(res, order);
  } catch (err) {
    next(err);
  }
}

export async function create(req: Request, res: Response, next: NextFunction) {
  try {
    const order = await ordersService.createOrder(req.body);
    sendSuccess(res, order, 201);
  } catch (err) {
    next(err);
  }
}

export async function update(req: Request, res: Response, next: NextFunction) {
  try {
    const order = await ordersService.updateOrder(req.params.orderId, req.body);
    sendSuccess(res, order);
  } catch (err) {
    next(err);
  }
}

export async function updateStatus(req: Request, res: Response, next: NextFunction) {
  try {
    const order = await ordersService.updateOrderStatus(req.params.orderId, req.body, req.user!.name);
    sendSuccess(res, order);
  } catch (err) {
    next(err);
  }
}

export async function getHistory(req: Request, res: Response, next: NextFunction) {
  try {
    const history = await ordersService.getOrderHistory(req.params.orderId);
    sendSuccess(res, history);
  } catch (err) {
    next(err);
  }
}

export async function getClosureSummary(req: Request, res: Response, next: NextFunction) {
  try {
    const summary = await ordersService.getOrderClosureSummary(req.params.orderId);
    sendSuccess(res, summary);
  } catch (err) {
    next(err);
  }
}

export async function remove(req: Request, res: Response, next: NextFunction) {
  try {
    await ordersService.deleteOrder(req.params.orderId);
    sendSuccess(res, null);
  } catch (err) {
    next(err);
  }
}
