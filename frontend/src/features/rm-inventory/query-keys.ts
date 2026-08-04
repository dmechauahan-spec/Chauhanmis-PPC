// Same hierarchical prefix-matching convention as orders/query-keys.ts —
// invalidating rmInventoryKeys.lists() (no filters) matches every
// filtered/paginated list variant.
export const rmInventoryKeys = {
  all: ["rm-inventory"] as const,
  lists: () => [...rmInventoryKeys.all, "list"] as const,
  list: (filters: Record<string, unknown>) => [...rmInventoryKeys.lists(), filters] as const,
};

// Module 7's own endpoints, reused here rather than duplicated — this
// feature is the only consumer of them today, but they belong to the
// materials module's own key namespace since Material Dashboard (its own
// future page) will read the same cache entries.
export const materialsKeys = {
  critical: () => ["materials", "critical"] as const,
  detail: (partId: string) => ["materials", "detail", partId] as const,
  // Material Dashboard's own endpoints — same prefix-matching convention as
  // every other list key in this app.
  shortagesLists: () => ["materials", "shortages"] as const,
  shortagesList: (filters: Record<string, unknown>) => [...materialsKeys.shortagesLists(), filters] as const,
  summary: () => ["materials", "summary"] as const,
};
