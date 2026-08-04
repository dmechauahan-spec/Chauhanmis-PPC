import { z } from 'zod';
import { paginationQuerySchema } from '../../utils/pagination';

const prStatusEnum = z.enum(['Draft', 'Sent', 'Approved', 'Fulfilled', 'Cancelled']);

export const prIdParamsSchema = z.object({
  prId: z
    .string()
    .regex(/^\d+$/, 'prId must be a positive integer')
    .transform((val) => BigInt(val)),
});

export const generatePrSchema = z.object({});

export const updatePrStatusSchema = z.object({
  newStatus: prStatusEnum,
});

export const listPrQuerySchema = paginationQuerySchema.extend({
  status: prStatusEnum.optional(),
});

export type PrIdParams = z.infer<typeof prIdParamsSchema>;
export type GeneratePrInput = z.infer<typeof generatePrSchema>;
export type UpdatePrStatusInput = z.infer<typeof updatePrStatusSchema>;
export type ListPrQuery = z.infer<typeof listPrQuerySchema>;
