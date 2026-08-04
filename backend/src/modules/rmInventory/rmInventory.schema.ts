import { z } from 'zod';
import { paginationQuerySchema } from '../../utils/pagination';

export const partIdParamsSchema = z.object({
  partId: z.string().min(1),
});

export const createRmInventorySchema = z.object({
  partId: z.string().min(1, 'partId is required'),
  stock: z.coerce.number().nonnegative().default(0),
});

export const updateRmInventorySchema = z
  .object({
    stock: z.coerce.number().nonnegative(),
  })
  .partial()
  .refine((data) => Object.keys(data).length > 0, { message: 'At least one field must be provided' });

export const adjustStockSchema = z.object({
  delta: z.coerce.number().refine((val) => val !== 0, { message: 'delta must be non-zero' }),
  reason: z.string().min(1, 'reason is required'),
});

export const listRmInventoryQuerySchema = paginationQuerySchema.extend({
  search: z.string().optional(),
});

export type CreateRmInventoryInput = z.infer<typeof createRmInventorySchema>;
export type UpdateRmInventoryInput = z.infer<typeof updateRmInventorySchema>;
export type AdjustStockInput = z.infer<typeof adjustStockSchema>;
export type ListRmInventoryQuery = z.infer<typeof listRmInventoryQuerySchema>;
