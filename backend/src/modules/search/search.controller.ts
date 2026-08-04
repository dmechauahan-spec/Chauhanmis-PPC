import { Request, Response, NextFunction } from 'express';
import { sendSuccess } from '../../utils/apiResponse';
import * as searchService from './search.service';
import { SearchQuery } from './search.schema';

export async function search(req: Request, res: Response, next: NextFunction) {
  try {
    const { q, limit } = req.query as unknown as SearchQuery;
    const result = await searchService.search(q, limit);
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
}
