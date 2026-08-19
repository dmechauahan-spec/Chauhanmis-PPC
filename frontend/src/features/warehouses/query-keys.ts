// FG Module Part 1 — no other consumer yet (FG Batches' own warehouse
// picker reads this same list, but through this same key — see
// use-warehouses.ts's useWarehousesForPicker), same shape as
// admin/query-keys.ts's machinesKeys.
export const warehousesKeys = {
  all: ["warehouses"] as const,
  lists: () => [...warehousesKeys.all, "list"] as const,
  list: (filters: Record<string, unknown>) => [...warehousesKeys.lists(), filters] as const,
};
