import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { materialsKeys } from "@/features/rm-inventory/query-keys";
import type { ApiSuccess, MaterialsSummary, OrderPriority, PaginatedResult, PartShortageSummary } from "@/types/api";

export interface MaterialShortagesFilters {
  page: number;
  pageSize: number;
  priority?: OrderPriority;
}

function cleanParams(filters: MaterialShortagesFilters): Record<string, unknown> {
  const { page, pageSize, priority } = filters;
  return { page, pageSize, ...(priority ? { priority } : {}) };
}

export function useMaterialShortages(filters: MaterialShortagesFilters) {
  const params = cleanParams(filters);
  return useQuery({
    queryKey: materialsKeys.shortagesList(params),
    queryFn: async () => {
      const res = await apiClient.get<ApiSuccess<PaginatedResult<PartShortageSummary>>>("/materials/shortages", {
        params,
      });
      return res.data.data;
    },
    placeholderData: (previousData) => previousData,
  });
}

export function useMaterialsSummary() {
  return useQuery({
    queryKey: materialsKeys.summary(),
    queryFn: async () => {
      const res = await apiClient.get<ApiSuccess<MaterialsSummary>>("/materials/summary");
      return res.data.data;
    },
  });
}
