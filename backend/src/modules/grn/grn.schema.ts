import { z } from 'zod';
import { GrnLineQcStatus } from '@prisma/client';
import { paginationQuerySchema } from '../../utils/pagination';

const grnQcStatusEnum = z.nativeEnum(GrnLineQcStatus);

// BODY-carried ids round-trip through JSON as plain numbers (see
// installBigIntJsonSupport) — same pathId/bodyId distinction every other
// module in this codebase's schema.ts files documents (see rfq.schema.ts).
const bodyId = z.coerce.bigint({ message: 'must be a valid integer id' });

// `grnNo`, not a numeric id, is this module's path identifier — same
// business-key-as-URL-segment convention purchaseOrders.schema.ts's
// poNumber uses.
export const grnNoParamsSchema = z.object({
  grnNo: z.string().min(1, 'grnNo is required'),
});

export const grnLineItemParamsSchema = grnNoParamsSchema.extend({
  id: z
    .string()
    .regex(/^\d+$/, 'id must be a positive integer')
    .transform((val) => BigInt(val)),
});

const createGrnLineItemSchema = z.object({
  poLineItemId: bodyId,
  receivedQty: z.number().positive('receivedQty must be greater than 0'),
  // Both optional — qcRequired defaults from the linked PurchaseItem's
  // category (see QC_REQUIRED_BY_CATEGORY in grn.service.ts) when omitted;
  // excessApproved defaults false, and MUST be explicitly true to accept a
  // receipt that pushes this line's cumulative total past its orderedQty
  // — see README "Purchase Module Part 4".
  qcRequired: z.boolean().optional(),
  excessApproved: z.boolean().default(false),
});

export const createGrnSchema = z
  .object({
    poId: bodyId,
    warehouseId: z.string().optional(),
    notes: z.string().optional(),
    lineItems: z.array(createGrnLineItemSchema).min(1, 'At least one line item is required'),
  })
  .refine((data) => new Set(data.lineItems.map((li) => li.poLineItemId.toString())).size === data.lineItems.length, {
    message: 'A GRN cannot list the same poLineItemId more than once — combine into a single line instead',
    path: ['lineItems'],
  });

export const qcInspectGrnLineItemSchema = z.object({
  passedQty: z.number().nonnegative('passedQty must be >= 0'),
  holdQty: z.number().nonnegative('holdQty must be >= 0').default(0),
  rejectedQty: z.number().nonnegative('rejectedQty must be >= 0').default(0),
  remarks: z.string().optional(),
  // inspectorName is deliberately NOT accepted here — server-derived from
  // req.user.name, same attribution convention as every other actor field
  // in this codebase (submittedBy, requestedBy, changedBy, ...) rather than
  // trusted free text. See README "Purchase Module Part 4".
});

export const listGrnsQuerySchema = paginationQuerySchema.extend({
  poId: bodyId.optional(),
  qcStatus: grnQcStatusEnum.optional(),
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
});

export type GrnNoParams = z.infer<typeof grnNoParamsSchema>;
export type GrnLineItemParams = z.infer<typeof grnLineItemParamsSchema>;
export type CreateGrnInput = z.infer<typeof createGrnSchema>;
export type QcInspectGrnLineItemInput = z.infer<typeof qcInspectGrnLineItemSchema>;
export type ListGrnsQuery = z.infer<typeof listGrnsQuerySchema>;
