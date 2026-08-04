import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { riskKeys } from "@/features/orders/query-keys";
import type { ApiSuccess, AtRiskOrderRow, PaginatedResult, RiskSummary } from "@/types/api";

export interface AtRiskOrdersFilters {
  page: number;
  pageSize: number;
  priority?: string;
  lineId?: string;
}

function cleanParams(filters: AtRiskOrdersFilters): Record<string, unknown> {
  const { page, pageSize, priority, lineId } = filters;
  return { page, pageSize, ...(priority ? { priority } : {}), ...(lineId ? { lineId } : {}) };
}

// Reads the same underlying production_schedule data as Scheduling's own
// list (Phase 3), but through this dedicated endpoint — sorted worst-first
// (slackDays asc) and joined to priority, which the generic schedule list
// doesn't do. Genuinely a different query, not a duplicate of
// scheduling/use-scheduling.ts#useScheduleList, so it gets its own hook —
// but the row rendering (badges, slack display) reuses the same shared
// components Scheduling already established rather than re-deriving them.
export function useAtRiskOrders(filters: AtRiskOrdersFilters) {
  const params = cleanParams(filters);
  return useQuery({
    queryKey: riskKeys.atRiskList(params),
    queryFn: async () => {
      const res = await apiClient.get<ApiSuccess<PaginatedResult<AtRiskOrderRow>>>("/risk/at-risk-orders", { params });
      return res.data.data;
    },
    placeholderData: (previousData) => previousData,
  });
}

export function useRiskSummary() {
  return useQuery({
    queryKey: riskKeys.summary(),
    queryFn: async () => {
      const res = await apiClient.get<ApiSuccess<RiskSummary>>("/risk/summary");
      return res.data.data;
    },
  });
}
