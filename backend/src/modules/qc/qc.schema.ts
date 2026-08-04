import { z } from 'zod';
import { paginationQuerySchema } from '../../utils/pagination';

export const batchNumberParamsSchema = z.object({
  batchNumber: z.string().min(1),
});

export const listQcBatchesQuerySchema = paginationQuerySchema.extend({
  orderId: z.string().optional(),
  sku: z.string().optional(),
  batchNumber: z.string().optional(),
});

export type BatchNumberParams = z.infer<typeof batchNumberParamsSchema>;
export type ListQcBatchesQuery = z.infer<typeof listQcBatchesQuerySchema>;
