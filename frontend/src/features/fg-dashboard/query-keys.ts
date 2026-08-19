// FG Module Part 5 (final part) — the summary dashboard. Trace lives under
// fg-batches/query-keys.ts instead (fgBatchesKeys.trace) — it's fundamentally
// an FgBatch-scoped read, same reasoning ppc-backend's fgDashboard.routes.ts
// itself uses for mounting GET .../trace at /api/fg-batches rather than
// /api/fg-dashboard.
export const fgDashboardKeys = {
  all: ["fg-dashboard"] as const,
  summary: (filters: Record<string, unknown>) => [...fgDashboardKeys.all, "summary", filters] as const,
};
