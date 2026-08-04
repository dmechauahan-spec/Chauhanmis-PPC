// Products and Lines' CRUD hooks reuse productsKeys (orders/query-keys.ts)
// and linesKeys (scheduling/query-keys.ts) directly rather than duplicating
// them here — those are the keys the SKU combobox / line selects used
// throughout the app already read from, so invalidating through the same
// keys is what keeps those pickers from going stale after an Admin edit.
// HR Teams and Users have no other consumer yet, so their keys live here.
export const hrTeamsKeys = {
  all: ["hr-teams"] as const,
  lists: () => [...hrTeamsKeys.all, "list"] as const,
  list: (filters: Record<string, unknown>) => [...hrTeamsKeys.lists(), filters] as const,
};

export const usersKeys = {
  all: ["users"] as const,
  lists: () => [...usersKeys.all, "list"] as const,
  list: (filters: Record<string, unknown>) => [...usersKeys.lists(), filters] as const,
};
