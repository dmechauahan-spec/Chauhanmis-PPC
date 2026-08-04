import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { schedulingKeys } from "./query-keys";
import { ordersKeys } from "@/features/orders/query-keys";
import type { ApiSuccess, OrderSchedule, PaginatedResult, RunSchedulingResult } from "@/types/api";

export interface ScheduleListFilters {
  page: number;
  pageSize: number;
  lineId?: string;
  status?: "OnTrack" | "AtRisk";
  startDateFrom?: string;
  startDateTo?: string;
  estEndDateFrom?: string;
  estEndDateTo?: string;
}

function cleanParams(filters: ScheduleListFilters): Record<string, unknown> {
  const { page, pageSize, lineId, status, startDateFrom, startDateTo, estEndDateFrom, estEndDateTo } = filters;
  return {
    page,
    pageSize,
    ...(lineId ? { lineId } : {}),
    ...(status ? { status } : {}),
    ...(startDateFrom ? { startDateFrom } : {}),
    ...(startDateTo ? { startDateTo } : {}),
    ...(estEndDateFrom ? { estEndDateFrom } : {}),
    ...(estEndDateTo ? { estEndDateTo } : {}),
  };
}

export function useScheduleList(filters: ScheduleListFilters) {
  const params = cleanParams(filters);
  return useQuery({
    queryKey: schedulingKeys.list(params),
    queryFn: async () => {
      const res = await apiClient.get<ApiSuccess<PaginatedResult<OrderSchedule>>>("/scheduling/schedule", {
        params,
      });
      return res.data.data;
    },
    placeholderData: (previousData) => previousData,
  });
}

// One mutation for both the dry-run preview and the real commit — callers
// pass { dryRun } explicitly each time (see RunSchedulingDialog) rather than
// this hook picking a default, so it's never ambiguous at the call site
// which one is happening.
export function useRunScheduling() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ dryRun }: { dryRun: boolean }) => {
      const res = await apiClient.post<ApiSuccess<RunSchedulingResult>>("/scheduling/run", { dryRun });
      return res.data.data;
    },
    onSuccess: (result, { dryRun }) => {
      if (dryRun) return; // a preview has no side effects — nothing to invalidate
      queryClient.invalidateQueries({ queryKey: schedulingKeys.lists() });
      queryClient.invalidateQueries({ queryKey: ordersKeys.lists() });
      for (const assignment of result.scheduled) {
        queryClient.invalidateQueries({ queryKey: ordersKeys.detail(assignment.orderId) });
        queryClient.invalidateQueries({ queryKey: ordersKeys.history(assignment.orderId) });
      }
    },
  });
}

export function useUnscheduleOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ orderId, reason }: { orderId: string; reason?: string }) => {
      await apiClient.delete(`/scheduling/schedule/${orderId}`, { data: reason ? { reason } : {} });
      return orderId;
    },
    onSuccess: (orderId) => {
      queryClient.invalidateQueries({ queryKey: schedulingKeys.lists() });
      queryClient.invalidateQueries({ queryKey: ordersKeys.lists() });
      queryClient.invalidateQueries({ queryKey: ordersKeys.detail(orderId) });
      queryClient.invalidateQueries({ queryKey: ordersKeys.history(orderId) });
    },
  });
}
