import { z } from 'zod';
import { paginationQuerySchema } from '../../utils/pagination';

export const warehouseParamsSchema = z.object({
  warehouseId: z.string().min(1),
});

export const createWarehouseSchema = z.object({
  warehouseId: z.string().min(1, 'warehouseId is required'),
  warehouseName: z.string().min(1, 'warehouseName is required'),
  location: z.string().optional(),
  isActive: z.boolean().default(true),
});

export const updateWarehouseSchema = z
  .object({
    warehouseName: z.string().min(1),
    location: z.string().nullable(),
    isActive: z.boolean(),
  })
  .partial()
  .refine((data) => Object.keys(data).length > 0, { message: 'At least one field must be provided' });

// z.coerce.boolean() is a footgun for query strings — Boolean("false") is
// true, since any non-empty string is truthy. Enumerate the two literal
// strings instead, same fix as shortageReport.schema.ts's overdueOnly —
// except this one stays a real tri-state (omitted -> undefined -> no
// filter at all, not just "false"), since ?isActive=false is a legitimate,
// distinct query from omitting the filter entirely.
const optionalBooleanQueryFlag = z
  .enum(['true', 'false'])
  .optional()
  .transform((v) => (v === undefined ? undefined : v === 'true'));

export const listWarehousesQuerySchema = paginationQuerySchema.extend({
  isActive: optionalBooleanQueryFlag,
});

export type CreateWarehouseInput = z.infer<typeof createWarehouseSchema>;
export type UpdateWarehouseInput = z.infer<typeof updateWarehouseSchema>;
export type ListWarehousesQuery = z.infer<typeof listWarehousesQuerySchema>;
