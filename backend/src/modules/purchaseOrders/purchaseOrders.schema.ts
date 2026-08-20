import { z } from 'zod';
import { PoStatus, PurchaseCategory } from '@prisma/client';
import { paginationQuerySchema } from '../../utils/pagination';

const purchaseCategoryEnum = z.nativeEnum(PurchaseCategory);
const poStatusEnum = z.nativeEnum(PoStatus);

// BODY-carried ids round-trip through JSON as plain numbers (see
// installBigIntJsonSupport), so a caller passing an id straight from a prior
// response — not just a hand-typed string — must also validate. Same
// pathId/bodyId distinction rfq.schema.ts documents; z.coerce.bigint()
// accepts a query-string digit too, so it's reused below for query filters
// as well rather than adding a third id schema.
const bodyId = z.coerce.bigint({ message: 'must be a valid integer id' });

// `poNumber`, not a numeric id, is this module's path identifier — same
// business-key-as-URL-segment convention Module 2 uses for `:orderId`.
export const poNumberParamsSchema = z.object({
  poNumber: z.string().min(1, 'poNumber is required'),
});

const poLineItemInputSchema = z.object({
  purchaseItemId: bodyId,
  specification: z.string().optional(),
  orderedQty: z.number().positive('orderedQty must be greater than 0'),
  uom: z.string().min(1, 'uom is required'),
  rate: z.number().nonnegative('rate must be 0 or greater'),
  discountPct: z.number().min(0).max(100).optional(),
  taxPct: z.number().min(0).max(100).optional(),
  freightOther: z.number().nonnegative().optional(),
  expectedDeliveryDate: z.coerce.date().optional(),
});

// Shared across both creation paths — PO-level fields neither the RFQ path
// nor the direct path treats as required, and that a caller may override on
// the RFQ path too (e.g. a required delivery date the indent never carried).
const poCommonFields = {
  requiredDeliveryDate: z.coerce.date().optional(),
  deliveryWarehouseId: z.string().optional(),
  paymentTerms: z.string().optional(),
  freightTerms: z.string().optional(),
  buyerName: z.string().optional(),
  remarks: z.string().optional(),
};

// From-RFQ path: supplier, category, and the single line item are all
// pulled server-side from the RFQ's source indent + selected
// SupplierQuotation (see purchaseOrders.service.ts's createFromRfq) — a
// caller supplies only `rfqId` plus whichever common PO-level fields it
// wants to set/override.
const createFromRfqSchema = z.object({
  rfqId: bodyId,
  ...poCommonFields,
});

// Direct path: no RFQ at all — a caller states everything itself. Legitimate
// for cases the spec allows without a fresh quotation round (e.g. a
// repeat/standing order to a known supplier) — see README "Purchase Module
// Part 3".
const createDirectSchema = z.object({
  supplierId: bodyId,
  category: purchaseCategoryEnum,
  lineItems: z.array(poLineItemInputSchema).min(1, 'At least one line item is required'),
  ...poCommonFields,
});

// Matched by shape at runtime ('rfqId' in input) in
// purchaseOrders.service.ts's createPurchaseOrder — see that function's own
// comment for why a discriminated union (which needs a literal
// discriminator field neither branch naturally has) wasn't used instead.
export const createPurchaseOrderSchema = z.union([createFromRfqSchema, createDirectSchema]);

// Cancelled requires cancellationReason; every other status leaves it
// optional. supplierConfirmedDate is only meaningful (and only persisted) on
// a transition INTO SupplierConfirmed — see the service for the default
// applied when it's omitted there.
export const updatePoStatusSchema = z
  .object({
    status: poStatusEnum,
    cancellationReason: z.string().optional(),
    supplierConfirmedDate: z.coerce.date().optional(),
  })
  .refine((data) => data.status !== PoStatus.Cancelled || !!data.cancellationReason?.trim(), {
    message: 'cancellationReason is required to cancel a purchase order',
    path: ['cancellationReason'],
  });

const amendLineItemSchema = z
  .object({
    id: bodyId,
    orderedQty: z.number().positive().optional(),
    rate: z.number().nonnegative().optional(),
    discountPct: z.number().min(0).max(100).nullable().optional(),
    taxPct: z.number().min(0).max(100).nullable().optional(),
    freightOther: z.number().nonnegative().optional(),
    expectedDeliveryDate: z.coerce.date().nullable().optional(),
    specification: z.string().nullable().optional(),
  })
  .refine((data) => Object.keys(data).length > 1, {
    message: 'At least one field besides id must be provided for a line item amendment',
  });

export const amendPurchaseOrderSchema = z
  .object({
    requiredDeliveryDate: z.coerce.date().nullable().optional(),
    deliveryWarehouseId: z.string().nullable().optional(),
    paymentTerms: z.string().nullable().optional(),
    freightTerms: z.string().nullable().optional(),
    buyerName: z.string().optional(),
    remarks: z.string().nullable().optional(),
    lineItems: z.array(amendLineItemSchema).min(1).optional(),
    // Applies to every field-change row this single request produces —
    // amendment history's own `reason` column, not persisted anywhere on
    // PurchaseOrder itself.
    reason: z.string().optional(),
  })
  .refine((data) => Object.entries(data).some(([key, value]) => key !== 'reason' && value !== undefined), {
    message: 'At least one field must be provided to amend',
  });

export const listPurchaseOrdersQuerySchema = paginationQuerySchema.extend({
  status: poStatusEnum.optional(),
  // Computed, not stored (see PurchaseOrder's own schema comment) — this
  // filter is applied as a derived WHERE clause in the service, not a plain
  // column match. Same tri-state pattern as warehouses.schema.ts's
  // optionalBooleanQueryFlag.
  overdue: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === 'true')),
  supplierId: bodyId.optional(),
  category: purchaseCategoryEnum.optional(),
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
});

export type PoNumberParams = z.infer<typeof poNumberParamsSchema>;
export type CreatePurchaseOrderInput = z.infer<typeof createPurchaseOrderSchema>;
export type UpdatePoStatusInput = z.infer<typeof updatePoStatusSchema>;
export type AmendPurchaseOrderInput = z.infer<typeof amendPurchaseOrderSchema>;
export type ListPurchaseOrdersQuery = z.infer<typeof listPurchaseOrdersQuerySchema>;
