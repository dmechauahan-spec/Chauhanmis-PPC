import { Request, Response, NextFunction } from 'express';
import { sendSuccess } from '../../utils/apiResponse';
import * as indentsService from './purchaseIndents.service';
import { ListIndentsQuery } from './purchaseIndents.schema';

export async function create(req: Request, res: Response, next: NextFunction) {
  try {
    const indent = await indentsService.createIndent(req.body, req.user!.name);
    sendSuccess(res, indent, 201);
  } catch (err) {
    next(err);
  }
}

export async function submit(req: Request, res: Response, next: NextFunction) {
  try {
    const { indentId } = req.params as unknown as { indentId: bigint };
    const indent = await indentsService.submitIndent(indentId, req.user!.name);
    sendSuccess(res, indent);
  } catch (err) {
    next(err);
  }
}

export async function approve(req: Request, res: Response, next: NextFunction) {
  try {
    const { indentId } = req.params as unknown as { indentId: bigint };
    const indent = await indentsService.approveIndent(indentId, req.user!.name, req.body);
    sendSuccess(res, indent);
  } catch (err) {
    next(err);
  }
}

export async function reject(req: Request, res: Response, next: NextFunction) {
  try {
    const { indentId } = req.params as unknown as { indentId: bigint };
    const indent = await indentsService.rejectIndent(indentId, req.user!.name, req.body);
    sendSuccess(res, indent);
  } catch (err) {
    next(err);
  }
}

export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await indentsService.listIndents(req.query as unknown as ListIndentsQuery);
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
}

export async function getById(req: Request, res: Response, next: NextFunction) {
  try {
    const { indentId } = req.params as unknown as { indentId: bigint };
    const indent = await indentsService.getIndentById(indentId);
    sendSuccess(res, indent);
  } catch (err) {
    next(err);
  }
}
