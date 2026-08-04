import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { oeeKeys } from "./query-keys";
import type { ApiSuccess, OeeAggregateResult, OeeByLineResult, OeeRow, PaginatedResult } from "@/types/api";

// dateFrom/dateTo are required on every OEE endpoint — an unbounded query
// would sum every log ever entered (see oee.schema.ts's comment).
export interface OeeDateRangeFilters {
  dateFrom: string;
  dateTo: string;
  lineId?: string;
  modelId?: string;
  shift?: string;
}

export interface OeeListFilters extends OeeDateRangeFilters {
  page: number;
  pageSize: number;
}

function cleanRangeParams(filters: OeeDateRangeFilters): Record<string, unknown> {
  const { dateFrom, dateTo, lineId, modelId, shift } = filters;
  return { dateFrom, dateTo, ...(lineId ? { lineId } : {}), ...(modelId ? { modelId } : {}), ...(shift ? { shift } : {}) };
}

// The OEE page seeds dateFrom/dateTo into the URL via an effect that only
// runs after the first render, so on that very first render both are still
// "" — without this guard, all three hooks below would fire immediately
// with empty-string dates and get a 400 back before the effect corrects
// the URL (confirmed live: three premature 400s on every fresh page load).
function isRangeReady(filters: OeeDateRangeFilters): boolean {
  return !!filters.dateFrom && !!filters.dateTo;
}

export function useOeeList(filters: OeeListFilters) {
  const { page, pageSize, ...range } = filters;
  const params = { page, pageSize, ...cleanRangeParams(range) };
  return useQuery({
    queryKey: oeeKeys.list(params),
    queryFn: async () => {
      const res = await apiClient.get<ApiSuccess<PaginatedResult<OeeRow>>>("/oee", { params });
      return res.data.data;
    },
    enabled: isRangeReady(range),
    placeholderData: (previousData) => previousData,
  });
}

export function useOeeSummary(filters: OeeDateRangeFilters) {
  const params = cleanRangeParams(filters);
  return useQuery({
    queryKey: oeeKeys.summary(params),
    queryFn: async () => {
      const res = await apiClient.get<ApiSuccess<OeeAggregateResult>>("/oee/summary", { params });
      return res.data.data;
    },
    enabled: isRangeReady(filters),
    placeholderData: (previousData) => previousData,
  });
}

export function useOeeByLine(filters: OeeDateRangeFilters) {
  const params = cleanRangeParams(filters);
  return useQuery({
    queryKey: oeeKeys.byLine(params),
    queryFn: async () => {
      const res = await apiClient.get<ApiSuccess<OeeByLineResult[]>>("/oee/by-line", { params });
      return res.data.data;
    },
    enabled: isRangeReady(filters),
    placeholderData: (previousData) => previousData,
  });
}
