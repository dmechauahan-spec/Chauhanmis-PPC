// The backend endpoint takes no filters beyond pagination (see
// orderStatusDashboard.schema.ts — "always shows every non-Closed order");
// status badge/priority/line filtering happens client-side against the one
// fetched page (see use-order-status-dashboard.ts). So there's just one
// real cache entry here, not a per-filter-combination list like every other
// module's `list(filters)` — still its own key hierarchy per convention,
// not reusing another feature's namespace.
export const orderStatusDashboardKeys = {
  all: ["orderStatusDashboard"] as const,
  list: () => [...orderStatusDashboardKeys.all, "list"] as const,
};
