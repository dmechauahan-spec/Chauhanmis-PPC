import { z } from 'zod';
import { paginationQuerySchema } from '../../utils/pagination';

function isValidDateString(val: string): boolean {
  return !Number.isNaN(Date.parse(val));
}

export const dispatchNoParamsSchema = z.object({
  dispatchNo: z.string().min(1),
});

const dispatchLineItemSchema = z.object({
  fgBatchId: z.coerce.bigint({ message: 'fgBatchId must be a valid integer id' }),
  quantity: z.coerce.number().positive('quantity must be greater than 0'),
});

// POST /api/fg-dispatches. salesOrderId is optional — a dispatch can be
// general/unaffiliated stock movement, not every dispatch fulfills a
// specific Sales Order (see fgDispatch.service.ts's own netting-order
// comment for exactly what that means for the reservation-vs-available
// split). dispatchDate/dispatchNo are never accepted here — dispatchDate
// always defaults to today (schema default), dispatchNo is always
// server-generated (see nextDispatchNo).
export const createDispatchSchema = z.object({
  salesOrderId: z.coerce.bigint().optional(),
  lineItems: z.array(dispatchLineItemSchema).min(1, 'At least one line item is required'),
  notes: z.string().optional(),
});

export const listDispatchesQuerySchema = paginationQuerySchema.extend({
  salesOrderId: z.coerce.bigint().optional(),
  dateFrom: z.string().refine(isValidDateString, { message: 'dateFrom must be a valid date' }).optional(),
  dateTo: z.string().refine(isValidDateString, { message: 'dateTo must be a valid date' }).optional(),
});

export type CreateDispatchInput = z.infer<typeof createDispatchSchema>;
export type ListDispatchesQuery = z.infer<typeof listDispatchesQuerySchema>;
