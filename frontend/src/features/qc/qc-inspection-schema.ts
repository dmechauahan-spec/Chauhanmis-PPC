import { z } from "zod";
import { optionalCoercedNumber } from "@/lib/zod-helpers";

function isValidDateString(val: string): boolean {
  return !Number.isNaN(Date.parse(val));
}

// Mirrors ppc-backend's qcInspection.schema.ts#QUANTITY_SUM_TOLERANCE
// exactly — absorbs harmless floating-point/rounding slop at the
// Decimal(12,2) boundary, not a "some overcounting is fine" allowance. See
// that file's comment for the full reasoning.
export const QUANTITY_SUM_TOLERANCE = 0.01;

// Mirrors ppc-backend's qcInspection.schema.ts#createQcInspectionSchema —
// client-side copy for immediate feedback, not a replacement for the
// backend's authoritative validation on submit. producedQty/passedQty/
// rejectedQty are required (not optionalCoercedNumber) because the backend
// requires them too; sampleQty/reworkQty are genuinely optional there
// (reworkQty defaults to 0 server-side if omitted).
export const qcInspectionFormSchema = z
  .object({
    orderId: z.string().min(1, "Order is required"),
    inspectionDate: z.string().min(1, "Date is required").refine(isValidDateString, { message: "Enter a valid date" }),
    // Free text, not a select scoped to the order's daily logs — GET
    // /api/daily-logs has no orderId filter to scope such a list against
    // (confirmed against dailyLogs.schema.ts), so a real picker here would
    // mean fetching every daily log and filtering client-side, which
    // doesn't scale. The backend validates it anyway (must exist AND
    // belong to this orderId — qcInspection.service.ts), so an invalid ID
    // still surfaces a clear error on submit rather than silently
    // misfiling.
    dailyLogId: z.string().optional(),
    producedQty: z.coerce.number().nonnegative("Produced qty must be >= 0"),
    sampleQty: optionalCoercedNumber(z.number().nonnegative("Sample qty must be >= 0")),
    passedQty: z.coerce.number().nonnegative("Passed qty must be >= 0"),
    rejectedQty: z.coerce.number().nonnegative("Rejected qty must be >= 0"),
    reworkQty: optionalCoercedNumber(z.number().nonnegative("Rework qty must be >= 0")),
    defectType: z.string().optional(),
    remarks: z.string().optional(),
    inspectorName: z.string().min(1, "Inspector name is required"),
  })
  .refine(
    (data) => data.passedQty + data.rejectedQty + (data.reworkQty ?? 0) <= data.producedQty + QUANTITY_SUM_TOLERANCE,
    {
      message: `Passed + Rejected + Rework qty must not exceed Produced qty (tolerance: ${QUANTITY_SUM_TOLERANCE})`,
      path: ["producedQty"],
    },
  );

export type QcInspectionFormInput = z.input<typeof qcInspectionFormSchema>;
export type QcInspectionFormValues = z.output<typeof qcInspectionFormSchema>;
