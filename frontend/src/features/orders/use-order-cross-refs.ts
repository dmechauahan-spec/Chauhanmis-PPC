import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import { apiClient } from "@/lib/api-client";
import { ctbKeys, riskKeys, scheduleKeys } from "./query-keys";
import type { ApiSuccess, AtRiskRecommendationsReport, CtbOrderResult, OrderSchedule } from "@/types/api";

export function useCtbForOrder(orderId: string | undefined) {
  return useQuery({
    queryKey: ctbKeys.order(orderId ?? ""),
    queryFn: async () => {
      const res = await apiClient.get<ApiSuccess<CtbOrderResult>>(`/ctb/order/${orderId}`);
      return res.data.data;
    },
    enabled: !!orderId,
  });
}

// GET /api/scheduling/schedule/:orderId 404s when the order hasn't been
// scheduled yet — that's a normal, expected state here (not every order
// has reached Scheduled), so it's caught and resolved to `null` rather
// than surfacing as a query error. A non-404 failure (network, 500, ...)
// still rejects normally and lands in the query's error state.
export function useScheduleForOrder(orderId: string | undefined) {
  return useQuery({
    queryKey: scheduleKeys.order(orderId ?? ""),
    queryFn: async (): Promise<OrderSchedule | null> => {
      try {
        const res = await apiClient.get<ApiSuccess<OrderSchedule>>(`/scheduling/schedule/${orderId}`);
        return res.data.data;
      } catch (err) {
        if (axios.isAxiosError(err) && err.response?.status === 404) {
          return null;
        }
        throw err;
      }
    },
    enabled: !!orderId,
  });
}

// Only meaningful once we already know the order's schedule is At Risk —
// callers should pass `enabled: false` (via the `enabled` param below)
// otherwise, so this never fires for an order that's healthy or not yet
// scheduled and just gets back a reportStatus it would discard.
export function useRiskRecommendations(orderId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: riskKeys.recommendations(orderId ?? ""),
    queryFn: async () => {
      const res = await apiClient.get<ApiSuccess<AtRiskRecommendationsReport>>(
        `/risk/at-risk-orders/${orderId}/recommendations`,
      );
      return res.data.data;
    },
    enabled: !!orderId && enabled,
  });
}
