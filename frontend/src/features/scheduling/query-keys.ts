// Mirrors src/features/orders/query-keys.ts's hierarchy pattern exactly —
// see that file for the rationale (prefix-matching invalidation).
export const schedulingKeys = {
  all: ["scheduling"] as const,
  lists: () => [...schedulingKeys.all, "list"] as const,
  list: (filters: Record<string, unknown>) => [...schedulingKeys.lists(), filters] as const,
};

export const linesKeys = {
  lists: () => ["lines", "list"] as const,
  // The unfiltered variant useLinesForFilter() reads from (params: {page:1,
  // pageSize:MAX_PAGE_SIZE}) is itself just one entry under this same
  // prefix — invalidating lists() catches it and every other filtered
  // variant (e.g. the Admin Lines page's own status filter).
  list: (filters: Record<string, unknown>) => [...linesKeys.lists(), filters] as const,
};
