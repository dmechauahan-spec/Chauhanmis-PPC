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

export type GenerateFgBatchInput = z.infer<typeof generateFgBatchSchema>;
export type ListFgBatchesQuery = z.infer<typeof listFgBatchesQuerySchema>;
