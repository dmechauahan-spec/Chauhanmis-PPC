import type { QcInspectionStatus } from "@/types/api";

// Mirrors ppc-backend's qcInspection.service.ts#deriveQcStatus exactly —
// same three-outcome reduction (passedQty<=0 -> Rejected; passedQty>0 with
// nothing rejected/reworked -> Passed; passedQty>0 with something rejected
// and/or reworked -> PartialPass). Client-side preview only, for immediate
// feedback while filling out the form — the server remains the sole source
// of truth for the persisted qcStatus, same "preview, not a replacement"
// pattern as Daily Logs' attendance.ts. Returns null before passedQty has
// been entered at all (nothing to preview yet).
export function deriveQcStatusPreview(
  passedQty: number | undefined,
  rejectedQty: number | undefined,
  reworkQty: number | undefined,
): QcInspectionStatus | null {
  if (passedQty == null || Number.isNaN(passedQty)) return null;
  if (passedQty <= 0) return "Rejected";
  const rejected = rejectedQty ?? 0;
  const rework = reworkQty ?? 0;
  return rejected > 0 || rework > 0 ? "PartialPass" : "Passed";
}
