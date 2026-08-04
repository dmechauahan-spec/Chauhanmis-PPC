import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import type { ApiSuccess, DashboardOverview } from "@/types/api";

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const OVERVIEW_RANGE_DAYS = 30;

function toDateParam(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function useDashboardOverview() {
  return useQuery({
    queryKey: ["dashboard", "overview", OVERVIEW_RANGE_DAYS],
    queryFn: async () => {
      const dateTo = new Date();
      const dateFrom = new Date(dateTo.getTime() - OVERVIEW_RANGE_DAYS * MS_PER_DAY);
      const res = await apiClient.get<ApiSuccess<DashboardOverview>>("/dashboard/overview", {
        params: { dateFrom: toDateParam(dateFrom), dateTo: toDateParam(dateTo) },
      });
      return res.data.data;
    },
    // The floor keeps this open for hours — refetch periodically so the
    // numbers stay current without the user needing to reload.
    refetchInterval: 60_000,
  });
}
