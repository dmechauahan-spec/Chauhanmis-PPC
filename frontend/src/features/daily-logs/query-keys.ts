// Same hierarchical prefix-matching convention as every other feature's
// query-keys.ts.
export const dailyLogsKeys = {
  all: ["daily-logs"] as const,
  lists: () => [...dailyLogsKeys.all, "list"] as const,
  list: (filters: Record<string, unknown>) => [...dailyLogsKeys.lists(), filters] as const,
  details: () => [...dailyLogsKeys.all, "detail"] as const,
  detail: (logId: string) => [...dailyLogsKeys.details(), logId] as const,
  downtimeSummaries: () => [...dailyLogsKeys.all, "downtime-summary"] as const,
  downtimeSummary: (filters: Record<string, unknown>) => [...dailyLogsKeys.downtimeSummaries(), filters] as const,
};
