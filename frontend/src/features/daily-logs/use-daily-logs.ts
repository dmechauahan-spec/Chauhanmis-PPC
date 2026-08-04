import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { dailyLogsKeys } from "./query-keys";
import type {
  ApiSuccess,
  CreateDailyLogPayload,
  DailyLog,
  DowntimeByReasonRow,
  DowntimeEntry,
  DowntimeEntryInput,
  PaginatedResult,
  UpdateDailyLogPayload,
} from "@/types/api";

export interface DailyLogsListFilters {
  page: number;
  pageSize: number;
  dateFrom?: string;
  dateTo?: string;
  lineId?: string;
  modelId?: string;
  shift?: string;
}

function cleanListParams(filters: DailyLogsListFilters): Record<string, unknown> {
  const { page, pageSize, dateFrom, dateTo, lineId, modelId, shift } = filters;
  return {
    page,
    pageSize,
    ...(dateFrom ? { dateFrom } : {}),
    ...(dateTo ? { dateTo } : {}),
    ...(lineId ? { lineId } : {}),
    ...(modelId ? { modelId } : {}),
    ...(shift ? { shift } : {}),
  };
}

export function useDailyLogsList(filters: DailyLogsListFilters) {
  const params = cleanListParams(filters);
  return useQuery({
    queryKey: dailyLogsKeys.list(params),
    queryFn: async () => {
      const res = await apiClient.get<ApiSuccess<PaginatedResult<DailyLog>>>("/daily-logs", { params });
      return res.data.data;
    },
    placeholderData: (previousData) => previousData,
  });
}

export function useDailyLog(logId: string | undefined) {
  return useQuery({
    queryKey: dailyLogsKeys.detail(logId ?? ""),
    queryFn: async () => {
      const res = await apiClient.get<ApiSuccess<DailyLog>>(`/daily-logs/${logId}`);
      return res.data.data;
    },
    enabled: !!logId,
  });
}

export interface DowntimeSummaryFilters {
  dateFrom?: string;
  dateTo?: string;
  lineId?: string;
}

function cleanDowntimeParams(filters: DowntimeSummaryFilters): Record<string, unknown> {
  const { dateFrom, dateTo, lineId } = filters;
  return { ...(dateFrom ? { dateFrom } : {}), ...(dateTo ? { dateTo } : {}), ...(lineId ? { lineId } : {}) };
}

export function useDowntimeByReason(filters: DowntimeSummaryFilters) {
  const params = cleanDowntimeParams(filters);
  return useQuery({
    queryKey: dailyLogsKeys.downtimeSummary(params),
    queryFn: async () => {
      const res = await apiClient.get<ApiSuccess<DowntimeByReasonRow[]>>("/daily-logs/summary/downtime-by-reason", {
        params,
      });
      return res.data.data;
    },
  });
}

export function useCreateDailyLog() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: CreateDailyLogPayload) => {
      const res = await apiClient.post<ApiSuccess<DailyLog>>("/daily-logs", payload);
      return res.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: dailyLogsKeys.lists() });
      queryClient.invalidateQueries({ queryKey: dailyLogsKeys.downtimeSummaries() });
    },
  });
}

export function useUpdateDailyLog(logId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: UpdateDailyLogPayload) => {
      const res = await apiClient.patch<ApiSuccess<DailyLog>>(`/daily-logs/${logId}`, payload);
      return res.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: dailyLogsKeys.detail(logId) });
      queryClient.invalidateQueries({ queryKey: dailyLogsKeys.lists() });
    },
  });
}

function invalidateDowntimeWrites(queryClient: ReturnType<typeof useQueryClient>, logId: string) {
  // Downtime minutes feed both this log's own detail view and the list
  // table's per-row sum, plus the module's downtime-by-reason widget.
  queryClient.invalidateQueries({ queryKey: dailyLogsKeys.detail(logId) });
  queryClient.invalidateQueries({ queryKey: dailyLogsKeys.lists() });
  queryClient.invalidateQueries({ queryKey: dailyLogsKeys.downtimeSummaries() });
}

export function useAddDowntimeEntry(logId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: DowntimeEntryInput) => {
      const res = await apiClient.post<ApiSuccess<DowntimeEntry>>(`/daily-logs/${logId}/downtime`, payload);
      return res.data.data;
    },
    onSuccess: () => invalidateDowntimeWrites(queryClient, logId),
  });
}

export function useRemoveDowntimeEntry(logId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (downtimeId: number) => {
      await apiClient.delete(`/daily-logs/${logId}/downtime/${downtimeId}`);
    },
    onSuccess: () => invalidateDowntimeWrites(queryClient, logId),
  });
}
