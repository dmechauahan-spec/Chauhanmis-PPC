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
