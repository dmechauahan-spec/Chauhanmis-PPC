import { z } from 'zod';
import { paginationQuerySchema } from '../../utils/pagination';

const plywoodGradeEnum = z.enum(['MR', 'BWR', 'BWP', 'Other']);
const fgQcStatusEnum = z.enum(['Pending', 'Pass', 'Fail', 'Hold']);
const fgStockStatusEnum = z.enum(['Available', 'Reserved', 'Hold']);
const fgDispatchStatusEnum = z.enum(['NotReady', 'Ready', 'Partial', 'Dispatched']);

function isValidDateString(val: string): boolean {
  return !Number.isNaN(Date.parse(val));
}

export const fgBatchNoParamsSchema = z.object({
  fgBatchNo: z.string().min(1),
});

// POST /api/fg-batches/generate — the ONLY way an FgBatch row is ever
// created (see README "FG Module Part 1" — "no manual quantity entry").
// productionOrderId/customer/productName/sku are deliberately NOT accepted
// here at all — they're always derived from the QC inspection's own linked
// order, never client-supplied, so a batch can't be pointed at a different
// order/product than the inspection it was actually generated from. The
// plywood attributes ARE accepted as optional overrides: a real batch's
// physical dimensions can legitimately differ from its product's nominal
// master-data spec (see fgBatch.service.ts).
export const generateFgBatchSchema = z.object({
  qcInspectionId: z.coerce.bigint({ message: 'qcInspectionId must be a valid integer id' }),
  warehouseId: z.string().min(1).optional(),
  rackBinLocation: z.string().min(1).optional(),
  salesOrderId: z.coerce.bigint().optional(),
  // Defaults to the QC inspection's own inspectionDate if omitted — see
  // fgBatch.service.ts. Accepted as an override since actual production can
  // predate the day QC certified it.
  productionDate: z.string().refine(isValidDateString, { message: 'productionDate must be a valid date' }).optional(),
  plywoodGrade: plywoodGradeEnum.optional(),
  thickness: z.coerce.number().positive().optional(),
  sheetLength: z.coerce.number().positive().optional(),
  sheetWidth: z.coerce.number().positive().optional(),
});

export const listFgBatchesQuerySchema = paginationQuerySchema.extend({
  productionOrderId: z.string().optional(),
  salesOrderId: z.coerce.bigint().optional(),
  warehouseId: z.string().optional(),
  qcStatus: fgQcStatusEnum.optional(),
  stockStatus: fgStockStatusEnum.optional(),
  dispatchStatus: fgDispatchStatusEnum.optional(),
});

// FG Module Part 2 — POST /api/fg-batches/:fgBatchNo/transfer. warehouseId
// is required (a transfer always names a real destination); rackBinLocation
// is optional and, if omitted, clears the batch's existing bin rather than
// carrying it over — a bin label from the old warehouse almost certainly
// doesn't mean anything in the new one. See fgBatch.service.ts.
export const transferFgBatchSchema = z.object({
  warehouseId: z.string().min(1, 'warehouseId is required'),
  rackBinLocation: z.string().min(1).optional(),
  notes: z.string().optional(),
});

// hold/release-hold both take an entirely optional body — `notes` doubles
// as the hold reason on hold, and as a release note on release.
export const holdFgBatchSchema = z.object({
  notes: z.string().optional(),
});

export const releaseHoldFgBatchSchema = z.object({
  notes: z.string().optional(),
});

export const listFgMovementsQuerySchema = paginationQuerySchema;

// FG Module Part 3 — POST /api/fg-batches/:fgBatchNo/reserve. qty is
// validated as > 0 here; the qty <= availableQty check (which needs the
// batch's own current state) happens in fgBatch.service.ts, same split as
// generate's warehouseId existence check.
export const reserveFgBatchSchema = z.object({
  salesOrderId: z.coerce.bigint({ message: 'salesOrderId must be a valid integer id' }),
  qty: z.coerce.number().positive('qty must be greater than 0'),
});

// FG Module Part 3 — POST /api/fg-reservations/:id/cancel. Same strict
// digit-string -> BigInt transform as qcInspection.schema.ts's idParamsSchema
// (not z.coerce.bigint(), which is for body fields, not path params).
export const fgReservationIdParamsSchema = z.object({
  id: z
    .string()
    .regex(/^\d+$/, 'id must be a positive integer')
    .transform((val) => BigInt(val)),
});

// FG Module Part 4 — GET /api/fg-batches/dispatch-eligible. salesOrderId
// here means "which Sales Order's reservations should be surfaced first" —
// a read-side preference, NOT the same thing as listFgBatchesQuerySchema's
// own salesOrderId (which filters Part 1's plain, now-superseded
// fg_batches.sales_order_id column). See fgBatch.service.ts.
export const listDispatchEligibleQuerySchema = paginationQuerySchema.extend({
  salesOrderId: z.coerce.bigint().optional(),
});

export type GenerateFgBatchInput = z.infer<typeof generateFgBatchSchema>;
export type ListFgBatchesQuery = z.infer<typeof listFgBatchesQuerySchema>;
export type TransferFgBatchInput = z.infer<typeof transferFgBatchSchema>;
export type HoldFgBatchInput = z.infer<typeof holdFgBatchSchema>;
export type ReleaseHoldFgBatchInput = z.infer<typeof releaseHoldFgBatchSchema>;
export type ListFgMovementsQuery = z.infer<typeof listFgMovementsQuerySchema>;
export type ReserveFgBatchInput = z.infer<typeof reserveFgBatchSchema>;
export type ListDispatchEligibleQuery = z.infer<typeof listDispatchEligibleQuerySchema>;
