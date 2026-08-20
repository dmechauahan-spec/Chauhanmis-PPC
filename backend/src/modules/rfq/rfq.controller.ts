import { Request, Response, NextFunction } from 'express';
import { sendSuccess } from '../../utils/apiResponse';
import * as rfqService from './rfq.service';
import { ListRfqsQuery } from './rfq.schema';

export async function create(req: Request, res: Response, next: NextFunction) {
  try {
    const rfq = await rfqService.createRfq(req.body, req.user!.name);
    sendSuccess(res, rfq, 201);
  } catch (err) {
    next(err);
  }
}

export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await rfqService.listRfqs(req.query as unknown as ListRfqsQuery);
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
}

export async function getById(req: Request, res: Response, next: NextFunction) {
  try {
    const { rfqId } = req.params as unknown as { rfqId: bigint };
    const rfq = await rfqService.getRfqById(rfqId);
    sendSuccess(res, rfq);
  } catch (err) {
    next(err);
  }
}

export async function createQuotation(req: Request, res: Response, next: NextFunction) {
  try {
    const { rfqId } = req.params as unknown as { rfqId: bigint };
    const quotation = await rfqService.createQuotation(rfqId, req.body, req.user!.name);
    sendSuccess(res, quotation, 201);
  } catch (err) {
    next(err);
  }
}

export async function updateQuotation(req: Request, res: Response, next: NextFunction) {
  try {
    const { rfqId, supplierId } = req.params as unknown as { rfqId: bigint; supplierId: bigint };
    const quotation = await rfqService.updateQuotation(rfqId, supplierId, req.body);
    sendSuccess(res, quotation);
  } catch (err) {
    next(err);
  }
}

export async function compare(req: Request, res: Response, next: NextFunction) {
  try {
    const { rfqId } = req.params as unknown as { rfqId: bigint };
    const result = await rfqService.compareQuotations(rfqId);
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
}

export async function selectSupplier(req: Request, res: Response, next: NextFunction) {
  try {
    const { rfqId } = req.params as unknown as { rfqId: bigint };
    const quotation = await rfqService.selectSupplier(rfqId, req.body.supplierId);
    sendSuccess(res, quotation);
  } catch (err) {
    next(err);
  }
}
