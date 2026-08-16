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

// Client Flow Part 1 — Machines. No other consumer yet (unlike Products/
// Lines' keys above), same shape as hrTeamsKeys/usersKeys.
export const machinesKeys = {
  all: ["machines"] as const,
  lists: () => [...machinesKeys.all, "list"] as const,
  list: (filters: Record<string, unknown>) => [...machinesKeys.lists(), filters] as const,
};
