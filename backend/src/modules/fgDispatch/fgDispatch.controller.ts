import { Request, Response, NextFunction } from 'express';
import { sendSuccess } from '../../utils/apiResponse';
import * as fgDispatchService from './fgDispatch.service';
import { ListDispatchesQuery } from './fgDispatch.schema';

export async function create(req: Request, res: Response, next: NextFunction) {
  try {
    // dispatchedBy is never client-supplied — same attribution convention
    // as every other write since the auth retrofit.
    const dispatch = await fgDispatchService.createDispatch(req.body, req.user!.name);
    sendSuccess(res, dispatch, 201);
  } catch (err) {
    next(err);
  }
}

export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await fgDispatchService.listDispatches(req.query as unknown as ListDispatchesQuery);
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
}

export async function getByNo(req: Request, res: Response, next: NextFunction) {
  try {
    const dispatch = await fgDispatchService.getDispatchByNo(req.params.dispatchNo);
    sendSuccess(res, dispatch);
  } catch (err) {
    next(err);
  }
}
