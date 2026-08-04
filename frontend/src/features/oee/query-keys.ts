export const oeeKeys = {
  all: ["oee"] as const,
  lists: () => [...oeeKeys.all, "list"] as const,
  list: (filters: Record<string, unknown>) => [...oeeKeys.lists(), filters] as const,
  summaries: () => [...oeeKeys.all, "summary"] as const,
  summary: (filters: Record<string, unknown>) => [...oeeKeys.summaries(), filters] as const,
  byLines: () => [...oeeKeys.all, "by-line"] as const,
  byLine: (filters: Record<string, unknown>) => [...oeeKeys.byLines(), filters] as const,
};
