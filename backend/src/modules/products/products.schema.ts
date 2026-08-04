import { z } from 'zod';
import { paginationQuerySchema } from '../../utils/pagination';

export const productParamsSchema = z.object({
  modelId: z.string().min(1),
});

export const createProductSchema = z.object({
  modelId: z.string().min(1, 'modelId is required'),
  modelName: z.string().min(1, 'modelName is required'),
  productType: z.string().min(1, 'productType is required'),
  sku: z.string().min(1, 'sku is required'),
  taktTimeSec: z.coerce.number().positive('taktTimeSec must be > 0'),
  manpowerRequired: z.coerce.number().int().positive('manpowerRequired must be > 0'),
  noOfStations: z.coerce.number().int().positive('noOfStations must be > 0'),
  changeoverTimeMin: z.coerce.number().nonnegative().optional(),
  notes: z.string().optional(),
});

export const updateProductSchema = z
  .object({
    modelName: z.string().min(1),
    productType: z.string().min(1),
    sku: z.string().min(1),
    taktTimeSec: z.coerce.number().positive('taktTimeSec must be > 0'),
    manpowerRequired: z.coerce.number().int().positive('manpowerRequired must be > 0'),
    noOfStations: z.coerce.number().int().positive('noOfStations must be > 0'),
    changeoverTimeMin: z.coerce.number().nonnegative().nullable(),
    notes: z.string().nullable(),
  })
  .partial()
  .refine((data) => Object.keys(data).length > 0, { message: 'At least one field must be provided' });

export const listProductsQuerySchema = paginationQuerySchema.extend({
  productType: z.string().optional(),
  search: z.string().optional(),
});

export type CreateProductInput = z.infer<typeof createProductSchema>;
export type UpdateProductInput = z.infer<typeof updateProductSchema>;
export type ListProductsQuery = z.infer<typeof listProductsQuerySchema>;
