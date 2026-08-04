import { z } from 'zod';

const uomEnum = z.enum(['Pcs', 'Set', 'Kg', 'Ltr', 'Mtr']);

export const modelRefParamsSchema = z.object({
  modelRef: z.string().min(1),
});

export const bomIdParamsSchema = z.object({
  id: z
    .string()
    .regex(/^\d+$/, 'id must be a positive integer')
    .transform((val) => BigInt(val)),
});

const bomItemSchema = z.object({
  uom: uomEnum.default('Pcs'),
  partName: z.string().min(1, 'partName is required'),
  qtyPerUnit: z.coerce.number().positive('qtyPerUnit must be > 0').default(1),
  partId: z.string().min(1).optional(),
});

export const createBomComponentSchema = bomItemSchema.extend({
  modelRef: z.string().min(1, 'modelRef is required'),
});

export const updateBomComponentSchema = bomItemSchema
  .partial()
  .refine((data) => Object.keys(data).length > 0, { message: 'At least one field must be provided' });

export const bulkImportBomSchema = z.object({
  modelRef: z.string().min(1, 'modelRef is required'),
  items: z.array(bomItemSchema).min(1, 'items must contain at least one row'),
});

export type CreateBomComponentInput = z.infer<typeof createBomComponentSchema>;
export type UpdateBomComponentInput = z.infer<typeof updateBomComponentSchema>;
export type BulkImportBomInput = z.infer<typeof bulkImportBomSchema>;
