import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { apiClient } from "@/lib/api-client";
import { productionPlanKeys } from "./query-keys";
import type { ApiSuccess, DailyProductionPlanRow, PlanVsActualResult } from "@/types/api";

// GET /api/production-plan/:orderId 404s when nothing has been generated
// yet — the same "expected, not an error" state as useScheduleForOrder's
// 404 handling above it in use-order-cross-refs.ts. Resolved to `null`
// here so callers can tell "not generated yet" apart from a real fetch
// failure.
export function useProductionPlan(orderId: string | undefined) {
  return useQuery({
    queryKey: productionPlanKeys.plan(orderId ?? ""),
    queryFn: async (): Promise<DailyProductionPlanRow[] | null> => {
      try {
        const res = await apiClient.get<ApiSuccess<DailyProductionPlanRow[]>>(`/production-plan/${orderId}`);
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

// Only meaningful once a plan is known to exist — callers pass `enabled`
// (gated on the Plan vs Actual view actually being selected, same
// lazy-fetch convention as useRiskRecommendations) so this never fires for
// an order with nothing generated yet and just gets back the same 404
// getProductionPlan itself would throw.
export function usePlanVsActual(orderId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: productionPlanKeys.planVsActual(orderId ?? ""),
    queryFn: async () => {
      const res = await apiClient.get<ApiSuccess<PlanVsActualResult>>(`/production-plan/${orderId}/plan-vs-actual`);
      return res.data.data;
    },
    enabled: !!orderId && enabled,
  });
}

// One mutation for both first-time generation and regeneration — the
// backend endpoint is the same either way (delete-then-recreate wholesale,
// see productionPlan.service.ts), so there's nothing for the two call sites
// to do differently besides which confirmation UI wraps the trigger.
export function useGenerateProductionPlan(orderId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await apiClient.post<ApiSuccess<DailyProductionPlanRow[]>>(`/production-plan/generate/${orderId}`);
      return res.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: productionPlanKeys.plan(orderId) });
      queryClient.invalidateQueries({ queryKey: productionPlanKeys.planVsActual(orderId) });
    },
  });
}
