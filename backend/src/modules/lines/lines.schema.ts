import { z } from 'zod';
import { paginationQuerySchema } from '../../utils/pagination';

const lineStatusEnum = z.enum(['Active', 'Offline']);

export const lineParamsSchema = z.object({
  lineId: z.string().min(1),
});

export const createLineSchema = z.object({
  lineId: z.string().min(1, 'lineId is required'),
  lineName: z.string().min(1, 'lineName is required'),
  maxWorkers: z.coerce.number().int().positive('maxWorkers must be > 0'),
  efficiencyPct: z.coerce.number().min(0).max(100),
  status: lineStatusEnum.default('Active'),
  notes: z.string().optional(),
  capPerDay: z.coerce.number().nonnegative().optional(),
  productTypes: z.array(z.string().min(1)).default([]),
});

export const updateLineSchema = z
  .object({
    lineName: z.string().min(1),
    maxWorkers: z.coerce.number().int().positive('maxWorkers must be > 0'),
    efficiencyPct: z.coerce.number().min(0).max(100),
    status: lineStatusEnum,
    notes: z.string().nullable(),
    capPerDay: z.coerce.number().nonnegative().nullable(),
    productTypes: z.array(z.string().min(1)),
  })
  .partial()
  .refine((data) => Object.keys(data).length > 0, { message: 'At least one field must be provided' });

export const listLinesQuerySchema = paginationQuerySchema.extend({
  status: lineStatusEnum.optional(),
});

export type CreateLineInput = z.infer<typeof createLineSchema>;
export type UpdateLineInput = z.infer<typeof updateLineSchema>;
export type ListLinesQuery = z.infer<typeof listLinesQuerySchema>;
