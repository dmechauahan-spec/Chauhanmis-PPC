import { z } from 'zod';
import { paginationQuerySchema } from '../../utils/pagination';

function isValidDateString(val: string): boolean {
  return !Number.isNaN(Date.parse(val));
}

// The tolerance rule: passedQty + rejectedQty + reworkQty is allowed to be
// LESS than producedQty (partial-sample inspection is realistic — not every
// unit produced has necessarily been inspected yet) but must not exceed
// producedQty by more than this amount. QUANTITY_SUM_TOLERANCE exists purely
// to absorb harmless floating-point/rounding slop at the 2-decimal-place
// boundary (Decimal(12,2) columns) — it is NOT a "some overcounting is fine"
// allowance. See README "Client Flow Part 3".
export const QUANTITY_SUM_TOLERANCE = 0.01;

export const idParamsSchema = z.object({
  id: z
    .string()
    .regex(/^\d+$/, 'id must be a positive integer')
    .transform((val) => BigInt(val)),
});

export const orderIdParamsSchema = z.object({
  orderId: z.string().min(1),
});

export const createQcInspectionSchema = z
  .object({
    orderId: z.string().min(1, 'orderId is required'),
    inspectionDate: z.string().refine(isValidDateString, { message: 'inspectionDate must be a valid date' }),
    // Optional link to the daily_production_log row this QC's — validated
    // (if provided) to both exist and belong to this same orderId.
    dailyLogId: z.string().min(1).optional(),
    producedQty: z.coerce.number().nonnegative('producedQty must be >= 0'),
    sampleQty: z.coerce.number().nonnegative('sampleQty must be >= 0').optional(),
    passedQty: z.coerce.number().nonnegative('passedQty must be >= 0'),
    rejectedQty: z.coerce.number().nonnegative('rejectedQty must be >= 0'),
    reworkQty: z.coerce.number().nonnegative('reworkQty must be >= 0').default(0),
    defectType: z.string().optional(),
    remarks: z.string().optional(),
    inspectorName: z.string().min(1, 'inspectorName is required'),
    // qcStatus is deliberately NOT accepted here — it's always server-derived
    // from the quantities above (see qcInspection.service.ts's
    // deriveQcStatus). Any qcStatus a caller sends is silently dropped by
    // Zod's default unknown-key stripping, same as absentEmployees/
    // attendancePct on Module 3's daily logs.
  })
  .refine((data) => data.passedQty + data.rejectedQty + data.reworkQty <= data.producedQty + QUANTITY_SUM_TOLERANCE, {
    message: `passedQty + rejectedQty + reworkQty must not exceed producedQty (tolerance: ${QUANTITY_SUM_TOLERANCE})`,
    path: ['producedQty'],
  });

export const listQcInspectionsQuerySchema = paginationQuerySchema.extend({
  orderId: z.string().optional(),
  dateFrom: z.string().refine(isValidDateString, { message: 'dateFrom must be a valid date' }).optional(),
  dateTo: z.string().refine(isValidDateString, { message: 'dateTo must be a valid date' }).optional(),
});

export type CreateQcInspectionInput = z.infer<typeof createQcInspectionSchema>;
export type ListQcInspectionsQuery = z.infer<typeof listQcInspectionsQuerySchema>;
export type IdParams = z.infer<typeof idParamsSchema>;
export type OrderIdParams = z.infer<typeof orderIdParamsSchema>;
