import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { fgDashboardKeys } from "./query-keys";
import type { ApiSuccess, FgDashboardSummary } from "@/types/api";

export interface FgDashboardFilters {
  dateFrom?: string;
  dateTo?: string;
}

// FG Module Part 5 (final part) — GET /api/fg-dashboard. Unlike Module 14's
// /dashboard or OEE's own summary, dateFrom/dateTo are BOTH genuinely
// optional here: they only scope todaysFgProduction/dispatchedQuantity
// (defaulting to today server-side when omitted) — every other figure is a
// current-state snapshot regardless. See ppc-backend README "FG Module
// Part 5".
export function useFgDashboardSummary(filters: FgDashboardFilters) {
  const params = { ...(filters.dateFrom ? { dateFrom: filters.dateFrom } : {}), ...(filters.dateTo ? { dateTo: filters.dateTo } : {}) };
  return useQuery({
    queryKey: fgDashboardKeys.summary(params),
    queryFn: async () => {
      const res = await apiClient.get<ApiSuccess<FgDashboardSummary>>("/fg-dashboard", { params });
      return res.data.data;
    },
  });
}
