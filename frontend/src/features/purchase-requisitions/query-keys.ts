// Same hierarchical prefix-matching convention as every other feature's
// query-keys.ts — invalidating prKeys.lists() (no filters) matches every
// filtered/paginated list variant.
export const prKeys = {
  all: ["purchase-requisitions"] as const,
  lists: () => [...prKeys.all, "list"] as const,
  list: (filters: Record<string, unknown>) => [...prKeys.lists(), filters] as const,
  details: () => [...prKeys.all, "detail"] as const,
  detail: (prId: string) => [...prKeys.details(), prId] as const,
};
