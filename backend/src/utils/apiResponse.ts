import { Response } from 'express';

export interface ApiSuccess<T> {
  success: true;
  data: T;
}

export interface ApiError {
  success: false;
  error: {
    message: string;
    details?: unknown;
  };
}

export function sendSuccess<T>(res: Response, data: T, statusCode = 200): Response {
  const body: ApiSuccess<T> = { success: true, data };
  return res.status(statusCode).json(body);
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export function buildPaginated<T>(
  items: T[],
  total: number,
  page: number,
  pageSize: number,
): PaginatedResult<T> {
  return { items, total, page, pageSize };
}
