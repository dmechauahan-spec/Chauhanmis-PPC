// Same hierarchical prefix-matching convention as every other feature's
// query-keys.ts.
export const qcKeys = {
  all: ["qc"] as const,
  batchLists: () => [...qcKeys.all, "batches", "list"] as const,
  batchList: (filters: Record<string, unknown>) => [...qcKeys.batchLists(), filters] as const,
  batchDetails: () => [...qcKeys.all, "batches", "detail"] as const,
  batchDetail: (batchNumber: string) => [...qcKeys.batchDetails(), batchNumber] as const,
};

export const testingPlansKeys = {
  all: ["testing-plans"] as const,
  lists: () => [...testingPlansKeys.all, "list"] as const,
  list: (filters: Record<string, unknown>) => [...testingPlansKeys.lists(), filters] as const,
};

// Distinct top-level key from qcKeys above — separate module, separate
// backend prefix (/api/qc-inspections vs. /api/qc), see README "QC Batches
// vs. QC Inspections".
export const qcInspectionsKeys = {
  all: ["qcInspections"] as const,
  lists: () => [...qcInspectionsKeys.all, "list"] as const,
  list: (filters: Record<string, unknown>) => [...qcInspectionsKeys.lists(), filters] as const,
  details: () => [...qcInspectionsKeys.all, "detail"] as const,
  detail: (id: string) => [...qcInspectionsKeys.details(), id] as const,
  summaries: () => [...qcInspectionsKeys.all, "summary"] as const,
  summary: (orderId: string) => [...qcInspectionsKeys.summaries(), orderId] as const,
};
