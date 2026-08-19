// FG Module Part 4 — Dispatch.
export const fgDispatchesKeys = {
  all: ["fg-dispatches"] as const,
  lists: () => [...fgDispatchesKeys.all, "list"] as const,
  list: (filters: Record<string, unknown>) => [...fgDispatchesKeys.lists(), filters] as const,
  details: () => [...fgDispatchesKeys.all, "detail"] as const,
  detail: (dispatchNo: string) => [...fgDispatchesKeys.details(), dispatchNo] as const,
};
