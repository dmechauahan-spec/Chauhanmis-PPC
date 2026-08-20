import { z } from 'zod';
import { paginationQuerySchema } from '../../utils/pagination';

// Path/query segments are always raw strings on the wire — validated with a
// digit regex + transform, same convention as every other module's
// `*IdParamsSchema` (purchaseIndents.indentIdParamsSchema, purchaseRequisitions.prIdParamsSchema, ...).
const pathId = z.string().regex(/^\d+$/, 'must be a positive integer').transform((val) => BigInt(val));

// BODY-carried ids need a DIFFERENT schema: ids round-trip through JSON as
// plain numbers (see installBigIntJsonSupport), so a caller passing an id
// straight from a prior response — not just a hand-typed string — must also
// validate. Same convention as fgDispatch.schema.ts's fgBatchId/salesOrderId.
const bodyId = z.coerce.bigint({ message: 'must be a valid integer id' });

export const rfqIdParamsSchema = z.object({
  rfqId: pathId,
});

export const rfqSupplierParamsSchema = z.object({
  rfqId: pathId,
  supplierId: pathId,
});

export const createRfqSchema = z.object({
  indentId: bodyId,
  supplierIds: z.array(bodyId).min(1, 'At least one supplierId is required'),
});

// Shared shape for the commercial terms a quotation carries — used as-is by
// create (rate required) and, as a partial, by update.
const quotationTermsSchema = z.object({
  rate: z.number().positive('rate must be greater than 0'),
  gstPct: z.number().min(0).max(100).optional(),
  freight: z.number().nonnegative().optional(),
  deliveryDays: z.number().int().positive().optional(),
  paymentTerms: z.string().optional(),
  validity: z.coerce.date().optional(),
  otherCharges: z.number().nonnegative().optional(),
});

export const createQuotationSchema = quotationTermsSchema.extend({
  supplierId: bodyId,
});

export const updateQuotationSchema = quotationTermsSchema
  .partial()
  .refine((data) => Object.keys(data).length > 0, { message: 'At least one field must be provided' });

export const selectSupplierSchema = z.object({
  supplierId: bodyId,
});

export const listRfqsQuerySchema = paginationQuerySchema.extend({
  indentId: pathId.optional(),
});

export type RfqIdParams = z.infer<typeof rfqIdParamsSchema>;
export type RfqSupplierParams = z.infer<typeof rfqSupplierParamsSchema>;
export type CreateRfqInput = z.infer<typeof createRfqSchema>;
export type CreateQuotationInput = z.infer<typeof createQuotationSchema>;
export type UpdateQuotationInput = z.infer<typeof updateQuotationSchema>;
export type SelectSupplierInput = z.infer<typeof selectSupplierSchema>;
export type ListRfqsQuery = z.infer<typeof listRfqsQuerySchema>;
