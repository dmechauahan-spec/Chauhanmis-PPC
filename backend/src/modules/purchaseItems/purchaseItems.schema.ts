import { z } from 'zod';
import { PurchaseCategory } from '@prisma/client';
import { paginationQuerySchema } from '../../utils/pagination';

const purchaseCategoryEnum = z.nativeEnum(PurchaseCategory);

export const purchaseItemParamsSchema = z.object({
  code: z.string().min(1),
});

export const createPurchaseItemSchema = z.object({
  itemCode: z.string().min(1, 'itemCode is required'),
  itemName: z.string().min(1, 'itemName is required'),
  category: purchaseCategoryEnum,
  specification: z.string().optional(),
  uom: z.string().min(1, 'uom is required'),
  // Required for RawMaterial, forbidden otherwise — enforced in the service
  // layer (purchaseItems.service.ts), not here, since the rule spans two
  // fields and also needs a DB existence check against rm_inventory. See
  // README "Purchase Module Part 1".
  rmPartId: z.string().optional(),
  minStock: z.number().nonnegative().optional(),
  maxStock: z.number().nonnegative().optional(),
  isActive: z.boolean().default(true),
});

export const updatePurchaseItemSchema = z
  .object({
    itemName: z.string().min(1),
    category: purchaseCategoryEnum,
    specification: z.string().nullable(),
    uom: z.string().min(1),
    rmPartId: z.string().nullable(),
    minStock: z.number().nonnegative().nullable(),
    maxStock: z.number().nonnegative().nullable(),
    isActive: z.boolean(),
  })
  .partial()
  .refine((data) => Object.keys(data).length > 0, { message: 'At least one field must be provided' });

const optionalBooleanQueryFlag = z
  .enum(['true', 'false'])
  .optional()
  .transform((v) => (v === undefined ? undefined : v === 'true'));

export const listPurchaseItemsQuerySchema = paginationQuerySchema.extend({
  category: purchaseCategoryEnum.optional(),
  isActive: optionalBooleanQueryFlag,
  search: z.string().optional(),
});

export type PurchaseItemParams = z.infer<typeof purchaseItemParamsSchema>;
export type CreatePurchaseItemInput = z.infer<typeof createPurchaseItemSchema>;
export type UpdatePurchaseItemInput = z.infer<typeof updatePurchaseItemSchema>;
export type ListPurchaseItemsQuery = z.infer<typeof listPurchaseItemsQuerySchema>;
