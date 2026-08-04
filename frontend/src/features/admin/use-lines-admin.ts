import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { linesKeys } from "@/features/scheduling/query-keys";
import type { ApiSuccess, CreateLinePayload, Line, PaginatedResult, UpdateLinePayload } from "@/types/api";

export interface LinesListFilters {
  page: number;
  pageSize: number;
  status?: "Active" | "Offline";
}

function cleanParams(filters: LinesListFilters): Record<string, unknown> {
  const { page, pageSize, status } = filters;
  return { page, pageSize, ...(status ? { status } : {}) };
}

export function useLinesList(filters: LinesListFilters) {
  const params = cleanParams(filters);
  return useQuery({
    queryKey: linesKeys.list(params),
    queryFn: async () => {
      const res = await apiClient.get<ApiSuccess<PaginatedResult<Line>>>("/lines", { params });
      return res.data.data;
    },
    placeholderData: (previousData) => previousData,
  });
}

// Invalidates linesKeys.lists() — the same prefix useLinesForFilter()
// (scheduling/use-lines.ts) reads from, so Scheduling/Daily Logs/HR
// Teams' line selects never show a stale line after an Admin edit here.
export function useCreateLine() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: CreateLinePayload) => {
      const res = await apiClient.post<ApiSuccess<Line>>("/lines", payload);
      return res.data.data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: linesKeys.lists() }),
  });
}

export function useUpdateLine() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ lineId, payload }: { lineId: string; payload: UpdateLinePayload }) => {
      const res = await apiClient.patch<ApiSuccess<Line>>(`/lines/${encodeURIComponent(lineId)}`, payload);
      return res.data.data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: linesKeys.lists() }),
  });
}

export function useDeleteLine() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (lineId: string) => {
      await apiClient.delete(`/lines/${encodeURIComponent(lineId)}`);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: linesKeys.lists() }),
  });
}
