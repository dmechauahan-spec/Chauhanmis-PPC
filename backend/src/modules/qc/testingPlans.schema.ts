import { z } from 'zod';
import { paginationQuerySchema } from '../../utils/pagination';

export const testingPlanIdParamsSchema = z.object({
  id: z
    .string()
    .regex(/^\d+$/, 'id must be a positive integer')
    .transform((val) => BigInt(val)),
});

export const createTestingPlanSchema = z.object({
  productType: z.string().min(1, 'productType is required'),
  planName: z.string().min(1, 'planName is required'),
  description: z.string().optional(),
});

export const updateTestingPlanSchema = z
  .object({
    productType: z.string().min(1),
    planName: z.string().min(1),
    description: z.string().nullable(),
  })
  .partial()
  .refine((data) => Object.keys(data).length > 0, { message: 'At least one field must be provided' });

export const listTestingPlansQuerySchema = paginationQuerySchema.extend({
  productType: z.string().optional(),
});

export type TestingPlanIdParams = z.infer<typeof testingPlanIdParamsSchema>;
export type CreateTestingPlanInput = z.infer<typeof createTestingPlanSchema>;
export type UpdateTestingPlanInput = z.infer<typeof updateTestingPlanSchema>;
export type ListTestingPlansQuery = z.infer<typeof listTestingPlansQuerySchema>;
