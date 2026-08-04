import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { hrTeamsKeys } from "./query-keys";
import type { ApiSuccess, CreateHrTeamPayload, HrTeamRow, PaginatedResult, UpdateHrTeamPayload } from "@/types/api";

export interface HrTeamsListFilters {
  page: number;
  pageSize: number;
  lineId?: string;
}

function cleanParams(filters: HrTeamsListFilters): Record<string, unknown> {
  const { page, pageSize, lineId } = filters;
  return { page, pageSize, ...(lineId ? { lineId } : {}) };
}

export function useHrTeamsList(filters: HrTeamsListFilters) {
  const params = cleanParams(filters);
  return useQuery({
    queryKey: hrTeamsKeys.list(params),
    queryFn: async () => {
      const res = await apiClient.get<ApiSuccess<PaginatedResult<HrTeamRow>>>("/hr-teams", { params });
      return res.data.data;
    },
    placeholderData: (previousData) => previousData,
  });
}

export function useCreateHrTeam() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: CreateHrTeamPayload) => {
      const res = await apiClient.post<ApiSuccess<HrTeamRow>>("/hr-teams", payload);
      return res.data.data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: hrTeamsKeys.lists() }),
  });
}

export function useUpdateHrTeam() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ teamId, payload }: { teamId: string; payload: UpdateHrTeamPayload }) => {
      const res = await apiClient.patch<ApiSuccess<HrTeamRow>>(`/hr-teams/${encodeURIComponent(teamId)}`, payload);
      return res.data.data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: hrTeamsKeys.lists() }),
  });
}

export function useDeleteHrTeam() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (teamId: string) => {
      await apiClient.delete(`/hr-teams/${encodeURIComponent(teamId)}`);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: hrTeamsKeys.lists() }),
  });
}
