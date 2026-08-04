import { z } from 'zod';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '../config/pagination';

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
});

export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

export function toSkipTake(pagination: PaginationQuery): { skip: number; take: number } {
  return {
    skip: (pagination.page - 1) * pagination.pageSize,
    take: pagination.pageSize,
  };
}
