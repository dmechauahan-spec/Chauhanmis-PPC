import { z } from 'zod';
import { paginationQuerySchema } from '../../utils/pagination';

export const supplierParamsSchema = z.object({
  code: z.string().min(1),
});

export const createSupplierSchema = z.object({
  supplierCode: z.string().min(1, 'supplierCode is required'),
  supplierName: z.string().min(1, 'supplierName is required'),
  gstNumber: z.string().optional(),
  contactPerson: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional(),
  address: z.string().optional(),
  paymentTerms: z.string().optional(),
  isActive: z.boolean().default(true),
});

export const updateSupplierSchema = z
  .object({
    supplierName: z.string().min(1),
    gstNumber: z.string().nullable(),
    contactPerson: z.string().nullable(),
    phone: z.string().nullable(),
    email: z.string().email().nullable(),
    address: z.string().nullable(),
    paymentTerms: z.string().nullable(),
    isActive: z.boolean(),
  })
  .partial()
  .refine((data) => Object.keys(data).length > 0, { message: 'At least one field must be provided' });

// Same tri-state pattern as warehouses.schema.ts's optionalBooleanQueryFlag —
// see that file's comment for why this isn't z.coerce.boolean().
const optionalBooleanQueryFlag = z
  .enum(['true', 'false'])
  .optional()
  .transform((v) => (v === undefined ? undefined : v === 'true'));

export const listSuppliersQuerySchema = paginationQuerySchema.extend({
  isActive: optionalBooleanQueryFlag,
  search: z.string().optional(),
});

export type SupplierParams = z.infer<typeof supplierParamsSchema>;
export type CreateSupplierInput = z.infer<typeof createSupplierSchema>;
export type UpdateSupplierInput = z.infer<typeof updateSupplierSchema>;
export type ListSuppliersQuery = z.infer<typeof listSuppliersQuerySchema>;
