// FG Module Parts 1-2-3-4-5 — hierarchical, same convention as
// orders/query-keys.ts: invalidating fgBatchesKeys.lists() (no filters)
// matches every filtered/paginated list variant via React Query's
// prefix-matching.
export const fgBatchesKeys = {
  all: ["fg-batches"] as const,
  lists: () => [...fgBatchesKeys.all, "list"] as const,
  list: (filters: Record<string, unknown>) => [...fgBatchesKeys.lists(), filters] as const,
  dispatchEligibleLists: () => [...fgBatchesKeys.all, "dispatch-eligible"] as const,
  dispatchEligibleList: (filters: Record<string, unknown>) => [...fgBatchesKeys.dispatchEligibleLists(), filters] as const,
  details: () => [...fgBatchesKeys.all, "detail"] as const,
  detail: (fgBatchNo: string) => [...fgBatchesKeys.details(), fgBatchNo] as const,
  // FG Module Part 2 — the audit ledger for one batch.
  movements: (fgBatchNo: string) => [...fgBatchesKeys.all, "movements", fgBatchNo] as const,
  // FG Module Part 5 — the full traceability chain for one batch.
  trace: (fgBatchNo: string) => [...fgBatchesKeys.all, "trace", fgBatchNo] as const,
  // "Has this QC inspection already been converted?" (QC Inspection detail
  // page's Generate FG Batch trigger) — see use-fg-batches.ts's
  // useFgBatchForInspection for why this isn't just a list() filter.
  forInspection: (orderId: string, qcInspectionId: number) => [...fgBatchesKeys.all, "for-inspection", orderId, qcInspectionId] as const,
};
