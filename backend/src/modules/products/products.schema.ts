import { z } from 'zod';
import { paginationQuerySchema } from '../../utils/pagination';

export const productParamsSchema = z.object({
  modelId: z.string().min(1),
});

// FG Module Part 1 — plywood-specific product attributes, all optional:
// most products in this system aren't plywood, and existing products
// shouldn't suddenly require these. See README "FG Module Part 1".
const plywoodGradeEnum = z.enum(['MR', 'BWR', 'BWP', 'Other']);

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
  plywoodGrade: plywoodGradeEnum.optional(),
  thickness: z.coerce.number().positive().optional(),
  sheetLength: z.coerce.number().positive().optional(),
  sheetWidth: z.coerce.number().positive().optional(),
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
    plywoodGrade: plywoodGradeEnum.nullable(),
    thickness: z.coerce.number().positive().nullable(),
    sheetLength: z.coerce.number().positive().nullable(),
    sheetWidth: z.coerce.number().positive().nullable(),
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
