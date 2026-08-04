import { Request, Response, NextFunction } from 'express';
import { sendSuccess } from '../../utils/apiResponse';
import * as linesService from './lines.service';
import { ListLinesQuery } from './lines.schema';

export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await linesService.listLines(req.query as unknown as ListLinesQuery);
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
}

export async function getById(req: Request, res: Response, next: NextFunction) {
  try {
    const line = await linesService.getLineById(req.params.lineId);
    sendSuccess(res, line);
  } catch (err) {
    next(err);
  }
}

export async function create(req: Request, res: Response, next: NextFunction) {
  try {
    const line = await linesService.createLine(req.body);
    sendSuccess(res, line, 201);
  } catch (err) {
    next(err);
  }
}

export async function update(req: Request, res: Response, next: NextFunction) {
  try {
    const line = await linesService.updateLine(req.params.lineId, req.body);
    sendSuccess(res, line);
  } catch (err) {
    next(err);
  }
}

export async function remove(req: Request, res: Response, next: NextFunction) {
  try {
    await linesService.deleteLine(req.params.lineId);
    sendSuccess(res, null);
  } catch (err) {
    next(err);
  }
}
